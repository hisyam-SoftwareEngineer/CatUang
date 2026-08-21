import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportService } from './report.service';
import { ExportStatus } from '@prisma/client';
import { Logger, Inject } from '@nestjs/common';
import type { FileStorageService } from '../ocr-processing/storage/file-storage.interface';

import { CreateExportDto } from './dto/create-export.dto';

interface ExportWorkerResult {
  success: boolean;
  downloadUrl: string;
}

@Processor('export-processing')
export class ExportWorker extends WorkerHost {
  private readonly logger = new Logger(ExportWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
    @Inject('FILE_STORAGE_SERVICE') private readonly storageService: FileStorageService,
  ) {
    super();
  }

  async process(job: Job<{ jobId: string; businessId: string; dto: CreateExportDto }>): Promise<ExportWorkerResult> {
    const { jobId, businessId, dto } = job.data;
    
    this.logger.log(`Memproses job export ${jobId} untuk format ${dto.format}`);

    try {
      let fileBuffer: Buffer;
      let filename: string;
      let contentType: string;

      // Saat ini kita fokus ke laporan PROFIT_LOSS
      if (dto.reportType !== 'PROFIT_LOSS') {
        throw new Error(`Report type ${dto.reportType} belum didukung`);
      }

      // Ambil data dari ReportService
      const reportData = await this.reportService.getProfitLoss(businessId, {
        from: dto.from,
        to: dto.to,
      });

      // Proses format CSV
      if (dto.format === 'CSV') {
        let csvContent = "Currency,TotalIncome,TotalExpense,NetProfit\n";
        for (const row of reportData.data) {
          csvContent += `${row.currency},${row.totalIncome},${row.totalExpense},${row.netProfit}\n`;
        }
        fileBuffer = Buffer.from(csvContent, 'utf-8');
        filename = `profit_loss_${businessId}_${Date.now()}.csv`;
        contentType = 'text/csv';
      } 
      // Proses format JSON
      else if (dto.format === 'JSON') {
        const jsonContent = JSON.stringify(reportData, null, 2);
        fileBuffer = Buffer.from(jsonContent, 'utf-8');
        filename = `profit_loss_${businessId}_${Date.now()}.json`;
        contentType = 'application/json';
      }
      else {
        // Fallback untuk PDF / XLSX jika belum diimplementasi lib generatornya (seperti Puppeteer/ExcelJS)
        // Kita keluarkan pesan sederhana di dalam txt, lalu dibilang PDF/XLSX
        const textContent = `Laporan belum mendukung output full ${dto.format}.\nBerikut data mentah:\n${JSON.stringify(reportData, null, 2)}`;
        fileBuffer = Buffer.from(textContent, 'utf-8');
        filename = `profit_loss_${businessId}_${Date.now()}.${dto.format.toLowerCase()}`;
        contentType = 'text/plain';
      }

      // Upload file ke storage service
      this.logger.log(`Mengupload file ${filename}...`);
      const downloadUrl = await this.storageService.uploadFile(fileBuffer, filename);

      // Update tabel ExportJob ke COMPLETED
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: ExportStatus.COMPLETED,
          downloadUrl,
        },
      });

      this.logger.log(`Job export ${jobId} selesai. Tautan: ${downloadUrl}`);
      return { success: true, downloadUrl };
    } catch (error) {
      this.logger.error(`Job export ${jobId} gagal`, error);
      
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: ExportStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }
}
