import { Injectable } from '@nestjs/common';
import { InputType } from '@prisma/client';
import { OcrProvider, NormalizedReceiptResult } from './ocr-provider.interface';

@Injectable()
export class DummyOcrProvider implements OcrProvider {
  name = 'dummy-ocr';
  supportedInputTypes: InputType[] = [InputType.RECEIPT];

  async extractReceipt(fileBuffer: Buffer, inputType?: InputType): Promise<NormalizedReceiptResult> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      merchantName: 'Toko Sejahtera Dummy',
      totalAmount: 150000,
      date: new Date().toISOString(),
      rawText: 'Toko Sejahtera Dummy\nTotal: 150.000',
      confidence: 0.95,
    };
  }
}
