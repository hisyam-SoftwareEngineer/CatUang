import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { OcrProcessingController } from './ocr-processing.controller';
import { OcrProcessingService } from './ocr-processing.service';
import { OcrWorker } from './ocr.worker';
import { DummyOcrProvider } from './providers/dummy-ocr.provider';
import { MindeeOcrProvider } from './providers/mindee-ocr.provider';
import { AzureOcrProvider } from './providers/azure-ocr.provider';
import { GeminiOcrProvider } from './providers/gemini-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';
import { TesseractOcrProvider } from './providers/tesseract-ocr.provider';
import { OcrProviderFactory } from './providers/ocr-provider.factory';
import { DummyStorageService } from './storage/dummy-storage.service';
import { CloudinaryStorageService } from './storage/cloudinary-storage.service';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigService } from '@nestjs/config';
import { UploadRateLimiterGuard } from './guards/upload-rate-limiter.guard';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ocr-processing',
    }),
    TransactionModule,
  ],
  controllers: [OcrProcessingController],
  providers: [
    OcrProcessingService,
    OcrWorker,
    // Storage
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
    
    // OCR Providers
    OcrProviderFactory,
    MindeeOcrProvider,
    AzureOcrProvider,
    DummyOcrProvider,
    GeminiOcrProvider,
    GoogleVisionOcrProvider,
    TesseractOcrProvider,
    UploadRateLimiterGuard,
  ],
})
export class OcrProcessingModule {}
