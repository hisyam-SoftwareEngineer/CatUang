import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportStatus } from '@prisma/client';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('export-processing') private readonly exportQueue: Queue,
  ) {}

  async createExportJob(businessId: string, userId: string, dto: CreateExportDto) {
    // Buat ExportJob record dengan status PROCESSING
    const job = await this.prisma.exportJob.create({
      data: {
        businessId,
        userId,
        status: ExportStatus.PROCESSING,
        reportType: dto.reportType,
        format: dto.format,
      },
    });

    // Masukkan ke background queue (BullMQ)
    await this.exportQueue.add('generate-report', {
      jobId: job.id,
      businessId,
      dto,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });

    return {
      exportJobId: job.id,
      status: job.status,
    };
  }

  async getExportJob(id: string, businessId: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!job) {
      throw new NotFoundException('Export job tidak ditemukan');
    }

    return {
      id: job.id,
      status: job.status,
      downloadUrl: job.downloadUrl,
      errorMessage: job.errorMessage,
    };
  }
}
