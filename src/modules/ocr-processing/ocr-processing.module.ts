import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ocr-processing',
    }),
  ],
})
export class OcrProcessingModule {}
