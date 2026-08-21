import { Injectable, Logger } from '@nestjs/common';
import { MindeeOcrProvider } from './mindee-ocr.provider';
import { AzureOcrProvider } from './azure-ocr.provider';
import { DummyOcrProvider } from './dummy-ocr.provider';
import { OcrProvider } from './ocr-provider.interface';

@Injectable()
export class OcrProviderFactory {
  private readonly logger = new Logger(OcrProviderFactory.name);

  constructor(
    private readonly mindeeProvider: MindeeOcrProvider,
    private readonly azureProvider: AzureOcrProvider,
    private readonly dummyProvider: DummyOcrProvider,
  ) {}

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
