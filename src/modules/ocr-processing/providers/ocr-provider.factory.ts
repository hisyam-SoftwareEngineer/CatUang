import { Injectable, Logger } from '@nestjs/common';
import { InputType } from '@prisma/client';
import { MindeeOcrProvider } from './mindee-ocr.provider';
import { AzureOcrProvider } from './azure-ocr.provider';
import { DummyOcrProvider } from './dummy-ocr.provider';
import { GeminiOcrProvider } from './gemini-ocr.provider';
import { GoogleVisionOcrProvider } from './google-vision-ocr.provider';
import { TesseractOcrProvider } from './tesseract-ocr.provider';
import { OcrProvider } from './ocr-provider.interface';

@Injectable()
export class OcrProviderFactory {
  private readonly logger = new Logger(OcrProviderFactory.name);

  constructor(
    private readonly mindeeProvider: MindeeOcrProvider,
    private readonly azureProvider: AzureOcrProvider,
    private readonly dummyProvider: DummyOcrProvider,
    private readonly geminiProvider: GeminiOcrProvider,
    private readonly googleVisionProvider: GoogleVisionOcrProvider,
    private readonly tesseractProvider: TesseractOcrProvider,
  ) {}

  /**
   * Kembalikan chain provider sesuai `inputType`.
   *
   * - `HANDWRITTEN`: [Gemini, GoogleVision, Tesseract]
   *   Hanya provider yang `isConfigured = true` yang dimasukkan.
   *   Tesseract selalu ada sebagai last resort (`isConfigured` selalu `true`).
   *
   * - `RECEIPT`: [Mindee, Azure, Dummy] — chain existing, tidak berubah.
   *
   * Requirements: 3.1, 3.2
   */
  getProvidersForInputType(inputType: InputType): OcrProvider[] {
    if (inputType === InputType.HANDWRITTEN) {
      const providers: OcrProvider[] = [];

      if (this.geminiProvider.isConfigured) {
        providers.push(this.geminiProvider);
        this.logger.debug('GeminiOcrProvider masuk ke chain HANDWRITTEN');
      } else {
        this.logger.debug(
          'GeminiOcrProvider tidak dikonfigurasi — dilewati dari chain HANDWRITTEN',
        );
      }

      if (this.googleVisionProvider.isConfigured) {
        providers.push(this.googleVisionProvider);
        this.logger.debug('GoogleVisionOcrProvider masuk ke chain HANDWRITTEN');
      } else {
        this.logger.debug(
          'GoogleVisionOcrProvider tidak dikonfigurasi — dilewati dari chain HANDWRITTEN',
        );
      }

      // Tesseract selalu ada sebagai last resort (isConfigured selalu true)
      providers.push(this.tesseractProvider);
      this.logger.debug(
        'TesseractOcrProvider ditambahkan sebagai last resort ke chain HANDWRITTEN',
      );

      return providers;
    }

    // InputType.RECEIPT — chain existing
    return this.getProviders();
  }

  /**
   * Chain provider untuk struk tercetak (RECEIPT).
   * Dipertahankan agar tidak breaking terhadap kode yang sudah ada.
   */
  getProviders(): OcrProvider[] {
    const providers: OcrProvider[] = [];

    if (this.mindeeProvider.isConfigured) {
      providers.push(this.mindeeProvider);
    }

    if (this.azureProvider.isConfigured) {
      providers.push(this.azureProvider);
    }

    // Selalu tambahkan dummy sebagai fallback terakhir
    providers.push(this.dummyProvider);

    return providers;
  }

  getPrimaryProvider(): OcrProvider {
    return this.getProviders()[0];
  }
}
