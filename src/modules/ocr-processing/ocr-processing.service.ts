import { randomUUID } from 'crypto';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { FileStorageService } from './storage/file-storage.interface';
import { ImportStatus, InputType, TransactionSourceType } from '@prisma/client';
import { TransactionService } from '../transaction/transaction.service';
import { ApproveImportDto } from './dto/approve-import.dto';
import { Decimal } from '@prisma/client/runtime/library';

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
    inputType: InputType = InputType.RECEIPT,
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
            inputType,
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
      inputType,
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
      parsedItems: item.parsedItems,
      confidence: item.confidence,
      rawOcrText: item.rawOcrText,
      inputType: item.inputType,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Langkah 3: Approve hasil OCR — buat Transaction dari data yang sudah dikoreksi user.
   * Hanya bisa dilakukan jika status masih PENDING_REVIEW.
   *
   * Dua alur:
   *  - selectedItems present dan non-empty → HANDWRITTEN multi-item flow
   *  - selectedItems absent → RECEIPT single-item backward-compat flow
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

    // ── Multi-item flow (HANDWRITTEN) ────────────────────────────────────
    if (dto.selectedItems && dto.selectedItems.length > 0) {
      const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

      // Step 1: Validate ALL items BEFORE executing any transactions
      for (const lineItem of dto.selectedItems) {
        // Validate amount is a positive Decimal (service-level check)
        let parsedAmount: Decimal;
        try {
          parsedAmount = new Decimal(lineItem.amount);
        } catch {
          throw new BadRequestException({
            errorCode: 'INVALID_AMOUNT',
            message: 'Jumlah transaksi tidak valid.',
          });
        }
        if (parsedAmount.lessThanOrEqualTo(0)) {
          throw new BadRequestException({
            errorCode: 'INVALID_AMOUNT',
            message: 'Jumlah transaksi harus lebih dari 0.',
          });
        }

        // Validate occurredAt is not more than 24 hours in the future
        const occurredAt = new Date(lineItem.occurredAt);
        const maxFuture = new Date(Date.now() + MAX_FUTURE_MS);
        if (occurredAt > maxFuture) {
          throw new BadRequestException({
            errorCode: 'INVALID_DATE',
            message: 'Tanggal tidak boleh lebih dari 24 jam di masa depan.',
          });
        }

        // Validate accountId belongs to this businessId
        const account = await this.prisma.account.findFirst({
          where: { id: lineItem.accountId, businessId, deletedAt: null },
        });
        if (!account) {
          throw new NotFoundException({
            errorCode: 'ACCOUNT_NOT_FOUND',
            message: 'Akun tidak ditemukan.',
          });
        }
      }

      // Step 2: Execute all creations atomically — any failure rolls back everything
      const transactionIds: string[] = [];

      await this.prisma.$transaction(async () => {
        let lastTransactionId: string | null = null;

        for (const lineItem of dto.selectedItems!) {
          const transaction = await this.transactionService.createTransaction(
            {
              accountId: lineItem.accountId,
              type: lineItem.type,
              amount: lineItem.amount,
              currency: lineItem.currency,
              occurredAt: lineItem.occurredAt,
              description: lineItem.description,
              categoryId: lineItem.categoryId,
            },
            userId,
            businessId,
            randomUUID(),
            TransactionSourceType.IMPORT_OCR,
          );

          transactionIds.push(transaction.id);
          lastTransactionId = transaction.id;
        }

        // Update ImportBatchItem: APPROVED + link to last created transaction
        // (transactionId is @unique — only one reference allowed per item)
        await this.prisma.importBatchItem.update({
          where: { id },
          data: {
            status: ImportStatus.APPROVED,
            transactionId: lastTransactionId,
          },
        });
      });

      return {
        transactionIds,
        status: ImportStatus.APPROVED,
      };
    }

    // ── Single-item flow (RECEIPT backward-compat) ───────────────────────
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

  /**
   * Langkah 3b: Tolak hasil OCR — tidak membuat Transaction.
   * Bisa dilakukan selama item belum APPROVED atau REJECTED (terminal state).
   */
  async rejectImport(id: string, reason: string | undefined, businessId: string) {
    const item = await this.prisma.importBatchItem.findUnique({
      where: { id },
      include: { batch: { select: { businessId: true } } },
    });

    if (!item) throw new NotFoundException('Import item tidak ditemukan');
    if (item.batch.businessId !== businessId) throw new ForbiddenException();

    if (
      item.status === ImportStatus.APPROVED ||
      item.status === ImportStatus.REJECTED
    ) {
      throw new BadRequestException({
        errorCode: 'IMPORT_ALREADY_PROCESSED',
        message: 'Import item sudah diproses sebelumnya.',
      });
    }

    await this.prisma.importBatchItem.update({
      where: { id },
      data: {
        status: ImportStatus.REJECTED,
        errorMessage: reason ?? null,
      },
    });

    return { status: ImportStatus.REJECTED };
  }
}
