import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InputType } from '@prisma/client';
import { ImageAnnotatorClient } from '@google-cloud/vision';

import { RedisService } from '../../../common/services/redis.service';
import {
  OcrProvider,
  NormalizedReceiptResult,
  ParsedLineItem,
} from './ocr-provider.interface';

/**
 * Monthly quota TTL: 35 days in seconds.
 * Ensures the key outlives the full calendar month.
 */
const MONTHLY_TTL_SECONDS = 3_024_000; // 35 * 24 * 60 * 60

/**
 * Max free-tier units to consume per month.
 * 800 = 80 % of Google Cloud Vision's 1,000 free units/month.
 */
const MONTHLY_QUOTA_THRESHOLD = 800;

/**
 * Keywords that indicate an outgoing (expense) transaction.
 * Bahasa Indonesia + common shorthand used in UMKM notebooks.
 */
const KELUAR_KEYWORDS = [
  'beli',
  'bayar',
  'belanja',
  'biaya',
  'ongkos',
  'modal',
  'pengeluaran',
  'keluar',
  'cicil',
  'utang',
  'hutang',
  'bayaran',
  'byr',
  'bl',
];

/**
 * Keywords that indicate an incoming (income) transaction.
 */
const MASUK_KEYWORDS = [
  'jual',
  'jualan',
  'terima',
  'dapat',
  'pemasukan',
  'masuk',
  'pendapatan',
  'penjualan',
  'omzet',
  'laku',
  'untung',
];

/**
 * Regex patterns to detect Rupiah amounts in various text formats:
 * - "Rp 50.000" / "Rp50000"
 * - "50.000" (dot as thousand separator)
 * - "50rb" / "50k" / "50 ribu" (informal shorthands)
 */
const AMOUNT_PATTERNS: RegExp[] = [
  /Rp\.?\s*([\d.,]+)/i,
  /\b(\d{1,3}(?:\.\d{3})+)\b/,
  /\b(\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)\b/i,
];

/**
 * GoogleVisionOcrProvider — Fallback #1 in the handwritten-scan chain.
 *
 * Uses Google Cloud Vision TEXT_DETECTION to extract raw text from an image,
 * then applies heuristic parsing to produce `ParsedLineItem[]`.
 *
 * Free tier: 1,000 units/month. This provider tracks usage via a Redis
 * monthly counter and skips itself when consumption reaches 800 units (80 %).
 *
 * Authentication:
 * - If `GOOGLE_CLOUD_VISION_API_KEY` is set, it is passed as `apiKey` in the
 *   client options.
 * - Otherwise the SDK auto-reads `GOOGLE_APPLICATION_CREDENTIALS` (service
 *   account JSON path) from the environment — no extra code needed.
 *
 * Requirements: 3.1, 3.4
 */
@Injectable()
export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = 'google-cloud-vision';
  readonly supportedInputTypes: InputType[] = [
    InputType.HANDWRITTEN,
    InputType.RECEIPT,
  ];

  private readonly logger = new Logger(GoogleVisionOcrProvider.name);
  private readonly client: ImageAnnotatorClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const apiKey = this.configService.get<string>(
      'GOOGLE_CLOUD_VISION_API_KEY',
    );
    const appCredentials = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );

    if (apiKey) {
      this.client = new ImageAnnotatorClient({ apiKey });
      this.logger.log('Google Vision OCR provider configured (API key)');
    } else if (appCredentials) {
      // SDK reads GOOGLE_APPLICATION_CREDENTIALS automatically from env.
      this.client = new ImageAnnotatorClient();
      this.logger.log(
        'Google Vision OCR provider configured (service account)',
      );
    } else {
      this.logger.warn(
        'Google Vision OCR provider is not configured — ' +
          'set GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_APPLICATION_CREDENTIALS',
      );
    }
  }

  /**
   * Returns `true` when either auth credential is present in the environment.
   */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Check whether the monthly free-tier quota (800 units) has been reached.
   *
   * Fail-open: if Redis is unavailable the method returns `false` so the
   * provider is still attempted rather than silently skipped.
   */
  async isQuotaExhausted(): Promise<boolean> {
    const key = this.monthlyKey();
    try {
      const raw = await this.redisService.get(key);
      if (raw === null) return false;

      const count = parseInt(raw, 10);
      if (isNaN(count)) return false;

      if (count >= MONTHLY_QUOTA_THRESHOLD) {
        this.logger.warn(
          `Google Vision monthly quota reached: ${count} / ${MONTHLY_QUOTA_THRESHOLD}`,
        );
        return true;
      }

      return false;
    } catch (err) {
      // Fail open — Redis error must not block OCR processing.
      this.logger.error(
        'Failed to check GCV quota (fail-open)',
        (err as Error).message,
      );
      return false;
    }
  }

  /**
   * Extract text from the image using Google Cloud Vision TEXT_DETECTION,
   * then parse the raw text into `ParsedLineItem[]` with Rupiah heuristics.
   */
  async extractReceipt(
    fileBuffer: Buffer,
    _inputType?: InputType,
  ): Promise<NormalizedReceiptResult> {
    if (!this.client) {
      throw new Error(
        'Google Vision OCR provider is not configured — ' +
          'GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_APPLICATION_CREDENTIALS missing',
      );
    }

    let rawOcrText = '';

    try {
      const [response] = await this.client.textDetection(fileBuffer);

      // The first element of textAnnotations contains the full page text.
      const annotations = response.textAnnotations;
      if (annotations && annotations.length > 0) {
        rawOcrText = annotations[0].description ?? '';
      }

      this.logger.debug(
        `GCV raw text (${rawOcrText.length} chars): ${rawOcrText.slice(0, 200)}`,
      );

      // Increment quota counter AFTER a successful API call.
      await this.incrementQuotaCounter();

      const items = this.parseTextToLineItems(rawOcrText);
      const overallConfidence = this.computeOverallConfidence(items);

      return {
        items,
        rawOcrText,
        rawText: rawOcrText,
        overallConfidence,
        confidence: overallConfidence,
      };
    } catch (err) {
      this.logger.error(
        'Google Vision API call failed',
        (err as Error).message,
      );
      throw new Error('Google Vision OCR request failed');
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build the Redis key for the current calendar month.
   * Format: `quota:gcv:monthly:YYYY-MM`
   */
  private monthlyKey(): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `quota:gcv:monthly:${yyyy}-${mm}`;
  }

  /**
   * Atomically increment the monthly usage counter.
   * TTL is only set on the first call of each month (handled by RedisService).
   * Errors are swallowed so a Redis hiccup never prevents the result from
   * being returned after a successful API call.
   */
  private async incrementQuotaCounter(): Promise<void> {
    const key = this.monthlyKey();
    try {
      await this.redisService.incr(key, MONTHLY_TTL_SECONDS);
    } catch (err) {
      this.logger.error(
        'Failed to increment GCV quota counter',
        (err as Error).message,
      );
    }
  }

  /**
   * Split raw OCR text into lines and parse each into a `ParsedLineItem`.
   * Lines without a detectable Rupiah amount are skipped.
   */
  private parseTextToLineItems(rawText: string): ParsedLineItem[] {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const items: ParsedLineItem[] = [];
    for (const line of lines) {
      const item = this.parseLine(line);
      if (item !== null) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Attempt to parse one text line into a `ParsedLineItem`.
   * Returns `null` if no valid amount can be extracted.
   */
  private parseLine(line: string): ParsedLineItem | null {
    const amount = this.extractAmount(line);
    if (amount === null || amount <= 0) {
      return null;
    }

    return {
      description: this.extractDescription(line),
      amount,
      type: this.inferTransactionType(line),
      date: this.extractDate(line),
      confidence: 0.6, // GCV text detection is more reliable than Tesseract
    };
  }

  /**
   * Try each amount pattern and return the first numeric Rupiah value found.
   * Returns `null` if nothing matches.
   */
  private extractAmount(line: string): number | null {
    for (const pattern of AMOUNT_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return this.normaliseAmount(match[1]);
      }
    }
    return null;
  }

  /**
   * Normalise an amount string to a plain integer (Rupiah).
   * "50.000" → 50000 | "1.500.000" → 1500000 | "50,5" → 51 (rounded)
   */
  private normaliseAmount(raw: string): number {
    // Remove dots used as thousand separators; swap comma decimal to dot.
    const cleaned = raw.replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : Math.round(value);
  }

  /**
   * Strip amount tokens from the line to produce a human-readable description.
   */
  private extractDescription(line: string): string {
    let desc = line;
    desc = desc.replace(/Rp\.?\s*[\d.,]+/gi, '');
    desc = desc.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, '');
    desc = desc.replace(/\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|k)\b/gi, '');
    desc = desc.replace(/[-–:=]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return desc.length > 0 ? desc : line.trim();
  }

  /**
   * Classify the line as MASUK (income) or KELUAR (expense) based on
   * keyword presence. Defaults to KELUAR when ambiguous — the safest
   * assumption for UMKM handwritten notebooks.
   */
  private inferTransactionType(line: string): 'MASUK' | 'KELUAR' {
    const lower = line.toLowerCase();
    for (const keyword of MASUK_KEYWORDS) {
      if (lower.includes(keyword)) return 'MASUK';
    }
    for (const keyword of KELUAR_KEYWORDS) {
      if (lower.includes(keyword)) return 'KELUAR';
    }
    return 'KELUAR';
  }

  /**
   * Extract an ISO 8601 date string from the line.
   * Supports DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY formats.
   * Returns `null` when no recognisable date is found.
   */
  private extractDate(line: string): string | null {
    const dmyFull = line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
    if (dmyFull) {
      const [, d, m, y] = dmyFull;
      return this.toIsoDate(parseInt(d, 10), parseInt(m, 10), parseInt(y, 10));
    }

    const dmyShort = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
    if (dmyShort) {
      const [, d, m, yy] = dmyShort;
      return this.toIsoDate(
        parseInt(d, 10),
        parseInt(m, 10),
        2000 + parseInt(yy, 10),
      );
    }

    return null;
  }

  /**
   * Validate and convert day/month/year integers to an ISO 8601 date string.
   * Returns `null` for invalid combinations (e.g. 31 Feb, out-of-range years).
   */
  private toIsoDate(day: number, month: number, year: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (year < 2000 || year > 2100) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    // Guard against JS date roll-over (e.g. 31/02 → 03/03)
    if (
      date.getUTCDate() !== day ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCFullYear() !== year
    ) {
      return null;
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Compute an overall confidence score for the page as the mean of all
   * parsed item confidences. Falls back to 0.4 when no items were found.
   */
  private computeOverallConfidence(items: ParsedLineItem[]): number {
    if (items.length === 0) return 0.4;
    const sum = items.reduce((acc, item) => acc + item.confidence, 0);
    return sum / items.length;
  }
}
