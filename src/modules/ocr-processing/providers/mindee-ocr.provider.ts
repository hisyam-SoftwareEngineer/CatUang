import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InputType } from '@prisma/client';
import { OcrProvider, NormalizedReceiptResult } from './ocr-provider.interface';

@Injectable()
export class MindeeOcrProvider implements OcrProvider {
  name = 'mindee';
  supportedInputTypes: InputType[] = [InputType.RECEIPT];
  private readonly logger = new Logger(MindeeOcrProvider.name);
  private apiKey: string | null = null;

  constructor(private configService: ConfigService) {
    const key = this.configService.get('MINDEE_API_KEY');
    if (key) {
      this.apiKey = key;
      this.logger.log('Mindee OCR provider configured (via Fetch API)');
    }
  }

  get isConfigured(): boolean {
    return this.apiKey !== null;
  }

  async extractReceipt(fileBuffer: Buffer, inputType?: InputType): Promise<NormalizedReceiptResult> {
    if (!this.apiKey) {
      throw new Error('Mindee API key not configured');
    }

    try {
      const formData = new FormData();
      formData.append('document', new Blob([new Uint8Array(fileBuffer)], { type: 'image/jpeg' }), 'receipt.jpg');

      const response = await fetch('https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Mindee API error: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      const receiptData = apiResponse.document.inference.prediction;

      const merchantName = receiptData.supplier_name?.value || undefined;
      const totalAmount = receiptData.total_amount?.value || undefined;
      const dateString = receiptData.date?.value || undefined;
      
      let date: string | undefined;
      if (dateString) {
        date = new Date(dateString).toISOString();
      }

      const rawText = `Merchant: ${merchantName || 'Unknown'}\nTotal: ${totalAmount || 0}\nDate: ${dateString || 'Unknown'}`;
      
      let confSum = 0;
      let confCount = 0;
      if (receiptData.supplier_name?.confidence !== undefined) {
        confSum += receiptData.supplier_name.confidence;
        confCount++;
      }
      if (receiptData.total_amount?.confidence !== undefined) {
        confSum += receiptData.total_amount.confidence;
        confCount++;
      }
      
      const confidence = confCount > 0 ? confSum / confCount : 0.5;

      return {
        merchantName,
        totalAmount,
        date,
        rawText,
        confidence,
      };
    } catch (error) {
      this.logger.error('Mindee extraction failed', error);
      throw error;
    }
  }
}
