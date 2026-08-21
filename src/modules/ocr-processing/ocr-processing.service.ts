import { randomUUID } from 'crypto';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { FileStorageService } from './storage/file-storage.interface';
import { ImportStatus } from '@prisma/client';
import { TransactionService } from '../transaction/transaction.service';
import { ApproveImportDto } from './dto/approve-import.dto';

@Injectable()
export class OcrProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('ocr-processing') private readonly ocrQueue: Queue,
    @Inject('FILE_STORAGE_SERVICE') private readonly storageService: FileStorageService,
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Langkah 1: Upload file → buat ImportBatchItem → enqueue job OCR background.
   * Langsung return 202 — proses OCR tidak blocking request.
   */
  async processImportRequest(
    businessId: string,
    fileBuffer: Buffer,
    filename: string,
  ) {
    // Upload gambar ke storage (Cloudinary/dummy)
    const imageUrl = await this.storageService.uploadFile(fileBuffer, filename);

    // Buat ImportBatch + satu ImportBatchItem berstatus PROCESSING
    const batch = await this.prisma.importBatch.create({
      data: {
        businessId,
        items: {
          create: {
            status: ImportStatus.PROCESSING,
            imageUrl,
          },
        },
      },
      include: { items: true },
    });

    const item = batch.items[0];

    // Enqueue job ke BullMQ worker
    await this.ocrQueue.add('extract-receipt', {
      itemId: item.id,
      imageUrl,
    });

    return {
      importBatchItemId: item.id,
      status: item.status,
    };
  }

  /**
   * Langkah 2: Cek status dan hasil parsing OCR.
   * Memastikan item milik bisnis yang meminta (tenant isolation).
   */
  async getImportItem(id: string, businessId: string) {
    const item = await this.prisma.importBatchItem.findUnique({
      where: { id },
      include: { batch: { select: { businessId: true } } },
    });

    if (!item) throw new NotFoundException('Import item tidak ditemukan');
    if (item.batch.businessId !== businessId) throw new ForbiddenException();

    return {
      id: item.id,
      status: item.status,
      parsedData: item.parsedData,
      providerUsed: item.providerUsed,
      imageUrl: item.imageUrl,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Langkah 3: Approve hasil OCR — buat Transaction dari data yang sudah dikoreksi user.
   * Hanya bisa dilakukan jika status masih PENDING_REVIEW.
   */
  async approveImport(
    id: string,
    dto: ApproveImportDto,
    businessId: string,
    userId: string,
  ) {
    const item = await this.prisma.importBatchItem.findUnique({
      where: { id },
      include: { batch: { select: { businessId: true } } },
    });

    if (!item) throw new NotFoundException('Import item tidak ditemukan');
    if (item.batch.businessId !== businessId) throw new ForbiddenException();
    if (item.status !== ImportStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Import item tidak bisa di-approve. Status saat ini: ${item.status}`,
      );
    }

    // Buat Transaction via TransactionService (atomik — saldo ter-update + AuditLog)
    const transaction = await this.transactionService.createTransaction(
      {
        accountId: dto.accountId,
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency,
        occurredAt: dto.occurredAt,
        description: dto.description,
        categoryId: dto.categoryId,
        counterAccountId: dto.counterAccountId,
        counterAmount: dto.counterAmount,
        exchangeRateUsed: dto.exchangeRateUsed,
      },
      userId,
      businessId,
      randomUUID(), // idempotency key unik per approve OCR — tidak perlu dari client
    );

    // Update ImportBatchItem: APPROVED + link ke Transaction
    await this.prisma.importBatchItem.update({
      where: { id },
      data: {
        status: ImportStatus.APPROVED,
        transactionId: transaction.id,
      },
    });

    return {
      transactionId: transaction.id,
      status: ImportStatus.APPROVED,
    };
  }
}
