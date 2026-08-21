import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComputerVisionClient } from '@azure/cognitiveservices-computervision';
import { ApiKeyCredentials } from '@azure/ms-rest-js';
import { OcrProvider, NormalizedReceiptResult } from './ocr-provider.interface';

@Injectable()
export class AzureOcrProvider implements OcrProvider {
  name = 'azure-vision';
  private readonly logger = new Logger(AzureOcrProvider.name);
  private client: ComputerVisionClient | null = null;

  constructor(private configService: ConfigService) {
    const key = this.configService.get('AZURE_VISION_KEY');
    const endpoint = this.configService.get('AZURE_VISION_ENDPOINT');

    if (key && endpoint) {
      const credentials = new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } });
      this.client = new ComputerVisionClient(credentials, endpoint);
      this.logger.log('Azure Computer Vision OCR provider configured');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async extractReceipt(fileBuffer: Buffer): Promise<NormalizedReceiptResult> {
    if (!this.client) {
      throw new Error('Azure Vision not configured');
    }

    try {
      // 1. Read API (async)
      const readResponse = await this.client.readInStream(fileBuffer);
      const operationLocation = readResponse.operationLocation;
      if (!operationLocation) throw new Error('No operation location returned');
      
      const operationId = operationLocation.substring(operationLocation.lastIndexOf('/') + 1);

      // 2. Poll for result
      let readResult;
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        readResult = await this.client.getReadResult(operationId);
        if (readResult.status !== 'notStarted' && readResult.status !== 'running') {
          break;
        }
      }

      if (readResult.status !== 'succeeded') {
        throw new Error(`Azure Read failed: ${readResult.status}`);
      }

      // 3. Extract text
      const textLines: string[] = [];
      let combinedText = '';

      if (readResult.analyzeResult && readResult.analyzeResult.readResults) {
        for (const page of readResult.analyzeResult.readResults) {
          for (const line of page.lines) {
            textLines.push(line.text);
            combinedText += line.text + '\n';
          }
        }
      }

      // Very naive heuristic for testing purposes since generic OCR doesn't extract structure well
      // In production, Azure Form Recognizer (Document Intelligence) would be used instead of Computer Vision for receipts
      let totalAmount: number | undefined;
      for (const line of textLines) {
        // Look for "Total" and a number
        if (line.toLowerCase().includes('total')) {
          const matches = line.match(/\d+[.,]\d+/);
          if (matches) {
            totalAmount = parseFloat(matches[0].replace(',', '.'));
          }
        }
      }

      return {
        merchantName: textLines.length > 0 ? textLines[0] : undefined, // guess first line is merchant
        totalAmount,
        rawText: combinedText,
        confidence: 0.8, // Generic Read API doesn't give document-level confidence
      };
    } catch (error) {
      this.logger.error('Azure Vision extraction failed', error);
      throw error;
    }
  }
}
