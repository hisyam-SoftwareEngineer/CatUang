import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { OcrProviderFactory } from './providers/ocr-provider.factory';
import { ImportStatus, InputType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import * as https from 'https';
import {
  NormalizedReceiptResult,
  ParsedLineItem,
} from './providers/ocr-provider.interface';

/**
 * Job data untuk queue `ocr-processing`.
 * `inputType` default-nya RECEIPT agar backward-compatible dengan job lama.
 */
interface OcrJobData {
  itemId: string;
  imageUrl: string;
  inputType?: InputType;
}

/**
 * Return type sukses dari `process()`.
 */
interface OcrJobResult {
  success: true;
  provider: string;
}

/**
 * BullMQ Worker untuk OCR processing.
 *
 * Concurrency: 3 job berjalan paralel.
 *
 * Retry: dikonfigurasi saat job di-enqueue (di OcrProcessingService):
 *   defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
 * Worker melempar ulang error agar BullMQ dapat men-schedule retry secara otomatis.
 *
 * Timeout: 60 000 ms — dikonfigurasi di BullMQ queue options saat job di-enqueue.
 */
@Processor('ocr-processing', { concurrency: 3 })
export class OcrWorker extends WorkerHost {
  private readonly logger = new Logger(OcrWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: OcrProviderFactory,
  ) {
    super();
  }

  // ─── Image download ───────────────────────────────────────────────────────

  /** Unduh URL gambar ke Buffer. Support dummy URL untuk testing lokal. */
  private downloadImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Dummy URL langsung return empty buffer (hanya untuk testing lokal tanpa key)
      if (url.startsWith('https://dummy-cloudinary.com')) {
        return resolve(Buffer.from(''));
      }

      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            return reject(
              new Error(`Failed to download image: ${response.statusCode}`),
            );
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        })
        .on('error', reject);
    });
  }

  // ─── ParsedLineItem validation ────────────────────────────────────────────

  /**
   * Validasi dan normalisasi array `ParsedLineItem` sebelum disimpan ke DB.
   *
   * Aturan:
   * 1. Item dengan `amount <= 0` → `confidence` di-set 0 (TIDAK dihapus — diflag untuk review).
   * 2. Item dengan `date` lebih dari 24 jam di masa depan → `date` di-set `null`
   *    dan `confidence` dikurangi 0.2 (minimum 0).
   */
  private validateParsedItems(items: ParsedLineItem[]): ParsedLineItem[] {
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    return items.map((item) => {
      let { confidence, date } = item;

      // Rule 1: amount <= 0 → confidence 0
      if (item.amount <= 0) {
        confidence = 0;
      }

      // Rule 2: date lebih dari 24 jam di masa depan → null + kurangi confidence
      if (date !== null) {
        const itemDate = new Date(date).getTime();
        if (itemDate - now > twentyFourHoursMs) {
          date = null;
          confidence = Math.max(0, confidence - 0.2);
        }
      }

      return { ...item, confidence, date };
    });
  }

  // ─── Main process ─────────────────────────────────────────────────────────

  async process(job: Job<OcrJobData>): Promise<OcrJobResult> {
    const { itemId, imageUrl, inputType = InputType.RECEIPT } = job.data;
    const providers = this.providerFactory.getProvidersForInputType(inputType);

    try {
      this.logger.log(`Downloading image for item ${itemId}`);
      const imageBuffer = await this.downloadImage(imageUrl);

      let result: NormalizedReceiptResult | null = null;
      let usedProviderName = 'unknown';

      // Coba provider satu per satu (Primary → Fallback → Dummy/Tesseract)
      for (const provider of providers) {
        try {
          this.logger.log(`Attempting OCR with provider: ${provider.name}`);
          result = await provider.extractReceipt(imageBuffer, inputType);
          usedProviderName = provider.name;
          break; // Sukses, keluar dari loop
        } catch (error) {
          this.logger.warn(
            `Provider ${provider.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Lanjut ke provider berikutnya
        }
      }

      if (!result) {
        throw new Error('Semua OCR providers gagal.');
      }

      // Validasi dan normalisasi ParsedLineItem sebelum disimpan ke DB
      const rawItems: ParsedLineItem[] = result.items ?? [];
      const validatedItems = this.validateParsedItems(rawItems);

      // Resolve confidence: utamakan overallConfidence, fallback ke confidence
      const confidence: number = result.overallConfidence ?? result.confidence;

      // rawOcrText bisa null jika provider tidak mengembalikannya
      const rawOcrText: string | null = result.rawOcrText ?? null;

      await this.prisma.importBatchItem.update({
        where: { id: itemId },
        data: {
          status: ImportStatus.PENDING_REVIEW,
          // Backward compat: simpan full result sebagai parsedData
          parsedData: result as object,
          // Field baru untuk handwritten scan
          parsedItems: validatedItems as object[],
          confidence,
          rawOcrText,
          providerUsed: usedProviderName,
        },
      });

      this.logger.log(
        `OCR processing succeeded for item ${itemId} using ${usedProviderName}`,
      );
      return { success: true, provider: usedProviderName };
    } catch (error) {
      this.logger.error(`OCR processing failed for item ${itemId}`, error);
      await this.prisma.importBatchItem.update({
        where: { id: itemId },
        data: {
          status: ImportStatus.ERROR,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });
      // Lempar ulang agar BullMQ men-schedule retry sesuai konfigurasi queue
      throw error;
    }
  }
}
