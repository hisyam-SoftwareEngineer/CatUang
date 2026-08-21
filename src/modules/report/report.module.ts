import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { ReportService } from './report.service';
import { ExportService } from './export.service';
import { ReportController, ExportController } from './report.controller';
import { ExportWorker } from './export.worker';
// Karena Cloudinary digunakan di Export dan OCR, kita butuh inject storage
import { CloudinaryStorageService } from '../ocr-processing/storage/cloudinary-storage.service';
import { DummyStorageService } from '../ocr-processing/storage/dummy-storage.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'export-processing',
    }),
  ],
  controllers: [ReportController, ExportController],
  providers: [
    ReportService,
    ExportService,
    ExportWorker,
    // Provide Storage Service yang sama untuk export file ke cloud (Cloudinary / Dummy)
    {
      provide: 'FILE_STORAGE_SERVICE',
      useFactory: (config: ConfigService, cloudinary: CloudinaryStorageService, dummy: DummyStorageService) => {
        const hasCloudinary = !!(config.get('CLOUDINARY_CLOUD_NAME') && config.get('CLOUDINARY_API_KEY') && config.get('CLOUDINARY_API_SECRET'));
        return hasCloudinary ? cloudinary : dummy;
      },
      inject: [ConfigService, CloudinaryStorageService, DummyStorageService],
    },
    CloudinaryStorageService,
    DummyStorageService,
  ],
})
export class ReportModule {}
