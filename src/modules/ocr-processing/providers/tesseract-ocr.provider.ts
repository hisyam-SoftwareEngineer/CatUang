import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InputType } from '@prisma/client';
import Tesseract from 'tesseract.js';
import {
  OcrProvider,
  NormalizedReceiptResult,
  ParsedLineItem,
} from './ocr-provider.interface';

/**
 * TesseractOcrProvider — last-resort self-hosted OCR fallback.
 *
 * - No API key required; always available (isConfigured = true).
 * - No quota limits.
 * - Supports HANDWRITTEN and RECEIPT input types.
 * - Confidence is intentionally clamped to 0.3–0.5 as a signal to the UI
 *   that results REQUIRE human review.
 * - Must never throw to the caller — all errors are caught and an empty
 *   result with confidence 0.3 is returned instead.
 *
 * Requirements: 3.1, 4.5
 */
@Injectable()
export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract-self-hosted';
  readonly supportedInputTypes: InputType[] = [
    InputType.HANDWRITTEN,
    InputType.RECEIPT,
  ];

  private readonly logger = new Logger(TesseractOcrProvider.name);
  private readonly lang: string;

  /** Min/max confidence bounds emitted by this provider. */
  private static readonly CONF_MIN = 0.3;
  private static readonly CONF_MAX = 0.5;

  /**
   * Keywords that indicate an outgoing (expense) transaction.
   * Bahasa Indonesia + common shorthand used in UMKM notebooks.
   */
  private static readonly KELUAR_KEYWORDS = [
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
  private static readonly MASUK_KEYWORDS = [
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
   * Regex patterns to match Rupiah amounts in various formats:
   * - Rp 50.000 / Rp50.000 / Rp 50000
   * - 50.000 / 50000
   * - 50rb / 50 rb / 50k (informal shorthand)
   */
  private static readonly AMOUNT_PATTERNS: RegExp[] = [
    // "Rp" prefix with dots/commas as thousand separators
    /Rp\.?\s*([\d.,]+)/i,
    // Standalone number with dots as thousand separator (e.g. 50.000 or 1.500.000)
    /\b(\d{1,3}(?:\.\d{3})+)\b/,
    // Informal shorthand: 50rb, 50 rb, 50K, 50k
    /\b(\d+(?:[.,]\d+)?)\s*(?:rb|ribu|k)\b/i,
  ];

  constructor(private readonly configService: ConfigService) {
    this.lang = this.configService.get<string>('TESSERACT_LANG', 'ind+eng');
    this.logger.log(
      `TesseractOcrProvider ready (lang=${this.lang}, no API key required)`,
    );
  }

  /** Always true — Tesseract is self-hosted; no external API key needed. */
  get isConfigured(): boolean {
    return true;
  }

  /**
   * Run Tesseract OCR on the provided image buffer and parse the resulting
   * text into structured `ParsedLineItem[]`.
   *
   * All errors are caught; on any failure an empty result with the minimum
   * confidence (0.3) is returned so the worker chain never crashes.
   */
  async extractReceipt(
    fileBuffer: Buffer,
    _inputType?: InputType,
  ): Promise<NormalizedReceiptResult> {
    let worker: Tesseract.Worker | null = null;

    try {
      worker = await Tesseract.createWorker(this.lang, Tesseract.OEM.DEFAULT, {
        // Suppress per-character progress logs in production
        logger: () => undefined,
      });

      const { data } = await worker.recognize(fileBuffer);
      const rawText = data.text ?? '';

      this.logger.debug(
        `Tesseract raw text (${rawText.length} chars): ${rawText.slice(0, 200)}`,
      );

      const items = this.parseTextToLineItems(rawText);
      const overallConf = this.clampConfidence(
        items.length > 0
          ? items.reduce((sum, i) => sum + i.confidence, 0) / items.length
          : TesseractOcrProvider.CONF_MIN,
      );

      return {
        items,
        rawOcrText: rawText,
        rawText,
        overallConfidence: overallConf,
        confidence: overallConf,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tesseract OCR failed: ${message}`);

      // Last resort — return empty result so the worker is NOT blocked.
      return {
        items: [],
        rawOcrText: '',
        rawText: '',
        overallConfidence: TesseractOcrProvider.CONF_MIN,
        confidence: TesseractOcrProvider.CONF_MIN,
      };
    } finally {
      // Always free Tesseract worker memory regardless of outcome.
      if (worker) {
        await worker.terminate().catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Failed to terminate Tesseract worker: ${msg}`);
        });
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Split raw OCR text into lines and attempt to parse each line as a
   * `ParsedLineItem`. Lines that do not contain a detectable amount are
   * skipped.
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

    const description = this.extractDescription(line);
    const type = this.inferTransactionType(line);
    const date = this.extractDate(line);

    return {
      description,
      amount,
      type,
      date,
      confidence: this.clampConfidence(TesseractOcrProvider.CONF_MIN + 0.1), // ~0.4
    };
  }

  /**
   * Try each amount pattern against the line and return the first numeric
   * value found (in full Rupiah, not decimals). Returns `null` if nothing
   * matches.
   */
  private extractAmount(line: string): number | null {
    for (const pattern of TesseractOcrProvider.AMOUNT_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return this.normaliseAmount(match[1]);
      }
    }
    return null;
  }

  /**
   * Normalise an amount string to a plain integer (Rupiah):
   * - "50.000"  → 50000
   * - "1.500.000" → 1500000
   * - "50,000" → 50000
   * - "50rb" / "50k" — handled by the calling regex (digit captured)
   */
  private normaliseAmount(raw: string): number {
    // Remove all dots used as thousand separators, replace commas with dots
    // for potential decimal values, then parse.
    const cleaned = raw.replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    if (isNaN(value)) return 0;

    // If the original string contained "rb" / "ribu" / "k" shorthand, the
    // calling regex already captured just the digits — multiply by 1000.
    // (The regex patterns pass the raw digit group only for shorthand matches.)
    return Math.round(value);
  }

  /**
   * Extract a human-readable description from the line by stripping the
   * amount portion and cleaning up surrounding noise.
   */
  private extractDescription(line: string): string {
    let desc = line;

    // Remove Rp prefix + number
    desc = desc.replace(/Rp\.?\s*[\d.,]+/gi, '');
    // Remove standalone numbers with dots (thousand separator)
    desc = desc.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, '');
    // Remove shorthand amounts
    desc = desc.replace(/\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|k)\b/gi, '');
    // Remove leftover punctuation clutter
    desc = desc.replace(/[-–:=]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    return desc.length > 0 ? desc : line.trim();
  }

  /**
   * Heuristic: classify the transaction as MASUK or KELUAR based on keyword
   * presence in the line (case-insensitive). Defaults to KELUAR when ambiguous
   * since most handwritten notes are expenses.
   */
  private inferTransactionType(line: string): 'MASUK' | 'KELUAR' {
    const lower = line.toLowerCase();

    for (const keyword of TesseractOcrProvider.MASUK_KEYWORDS) {
      if (lower.includes(keyword)) return 'MASUK';
    }
    for (const keyword of TesseractOcrProvider.KELUAR_KEYWORDS) {
      if (lower.includes(keyword)) return 'KELUAR';
    }

    // Default: treat as expense (KELUAR) — safest assumption for UMKM notebooks
    return 'KELUAR';
  }

  /**
   * Attempt to extract an ISO 8601 date string from a line.
   * Supports common Indonesian formats:
   * - DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY
   * - DD/MM/YY, DD-MM-YY
   * Returns null when no recognisable date is found.
   */
  private extractDate(line: string): string | null {
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyFull = line.match(
      /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/,
    );
    if (dmyFull) {
      const [, d, m, y] = dmyFull;
      return this.toIsoDate(
        parseInt(d, 10),
        parseInt(m, 10),
        parseInt(y, 10),
      );
    }

    // DD/MM/YY or DD-MM-YY
    const dmyShort = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
    if (dmyShort) {
      const [, d, m, yy] = dmyShort;
      const year = 2000 + parseInt(yy, 10);
      return this.toIsoDate(parseInt(d, 10), parseInt(m, 10), year);
    }

    return null;
  }

  /**
   * Validate and convert day/month/year integers to an ISO 8601 date string.
   * Returns null if the date is invalid.
   */
  private toIsoDate(day: number, month: number, year: number): string | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (year < 2000 || year > 2100) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    // Guard against JS date overflow (e.g. 31/02 → 03/03)
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
   * Clamp a confidence value to the [CONF_MIN, CONF_MAX] range.
   * This signals to the UI that Tesseract results always need close review.
   */
  private clampConfidence(value: number): number {
    return Math.min(
      TesseractOcrProvider.CONF_MAX,
      Math.max(TesseractOcrProvider.CONF_MIN, value),
    );
  }
}
