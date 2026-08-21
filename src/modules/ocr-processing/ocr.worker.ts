import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { OcrProviderFactory } from './providers/ocr-provider.factory';
import { ImportStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';
import * as https from 'https';

@Processor('ocr-processing')
export class OcrWorker extends WorkerHost {
  private readonly logger = new Logger(OcrWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: OcrProviderFactory,
  ) {
    super();
  }

  // Fungsi helper sederhana untuk mengunduh gambar ke Buffer
  private downloadImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Dummy URL langsung return empty buffer (hanya untuk testing lokal tanpa key)
      if (url.startsWith('https://dummy-cloudinary.com')) {
        return resolve(Buffer.from(''));
      }

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
        
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  async process(job: Job<{ itemId: string; imageUrl: string }>): Promise<any> {
    const { itemId, imageUrl } = job.data;
    const providers = this.providerFactory.getProviders();

    try {
      this.logger.log(`Downloading image for item ${itemId}`);
      const imageBuffer = await this.downloadImage(imageUrl);

      let parsedData: any = null;
      let usedProviderName = 'unknown';

      // Coba provider satu per satu (Primary -> Fallback -> Dummy)
      for (const provider of providers) {
        try {
          this.logger.log(`Attempting OCR with provider: ${provider.name}`);
          parsedData = await provider.extractReceipt(imageBuffer);
          usedProviderName = provider.name;
          break; // Sukses, keluar dari loop
        } catch (error) {
          this.logger.warn(`Provider ${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`);
          // Lanjut ke provider berikutnya
        }
      }

      if (!parsedData) {
        throw new Error('Semua OCR providers gagal.');
      }

      await this.prisma.importBatchItem.update({
        where: { id: itemId },
        data: {
          status: ImportStatus.PENDING_REVIEW,
          parsedData: parsedData as any,
          providerUsed: usedProviderName,
        },
      });

      return { success: true, provider: usedProviderName };
    } catch (error) {
      this.logger.error(`OCR processing failed for item ${itemId}`, error);
      await this.prisma.importBatchItem.update({
        where: { id: itemId },
        data: {
          status: ImportStatus.ERROR,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }
}
