import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { InputType } from '@prisma/client';

import { RedisService } from '../../../common/services/redis.service';
import {
  OcrProvider,
  NormalizedReceiptResult,
  ParsedLineItem,
} from './ocr-provider.interface';

/**
 * Tipe internal untuk response JSON dari Gemini.
 * Memastikan tidak ada `any` di seluruh file.
 */
interface GeminiResponseItem {
  description: unknown;
  amount: unknown;
  type: unknown;
  date: unknown;
  confidence: unknown;
}

interface GeminiJsonResponse {
  items: GeminiResponseItem[];
  rawText: unknown;
  overallConfidence: unknown;
  language: unknown;
}

/** Window rate limiter: 60 detik */
const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Max 12 RPM — 80% dari free tier 15 RPM untuk buffer */
const RATE_LIMIT_THRESHOLD = 12;

/** System prompt yang dikirim ke Gemini 1.5 Flash (dari design.md Section 3.3) */
const SYSTEM_PROMPT = `Kamu adalah asisten pembukuan UMKM Indonesia yang sangat teliti.
Analisis gambar ini dengan seksama. Gambar mungkin berisi:
- Halaman buku catatan dengan beberapa transaksi
- Struk tulisan tangan dari toko/warung
- Catatan pengeluaran/pemasukan harian

Tugasmu:
1. Ekstrak SEMUA transaksi yang ada di gambar
2. Untuk setiap transaksi, identifikasi: deskripsi, jumlah uang (Rupiah), tanggal (jika ada), jenis (pemasukan/pengeluaran)
3. Jika jumlah tidak jelas, sertakan nilai 0 dan tandai confidence rendah
4. Kembalikan hasil dalam format JSON yang valid

Format output WAJIB:
{
  "items": [{ "description": "string", "amount": number, "type": "MASUK"|"KELUAR", "date": "YYYY-MM-DD"|null, "confidence": 0.0-1.0 }],
  "rawText": "teks lengkap yang berhasil dibaca",
  "overallConfidence": 0.0-1.0,
  "language": "id"|"mixed"
}`;

@Injectable()
export class GeminiOcrProvider implements OcrProvider {
  readonly name = 'gemini-1.5-flash';
  readonly supportedInputTypes: InputType[] = [
    InputType.HANDWRITTEN,
    InputType.RECEIPT,
  ];

  private readonly logger = new Logger(GeminiOcrProvider.name);
  private readonly model: GenerativeModel | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_PROMPT,
      });
      this.logger.log('Gemini OCR provider configured');
    }
  }

  /**
   * Return `true` jika `GEMINI_API_KEY` tersedia di environment.
   */
  get isConfigured(): boolean {
    return this.model !== null;
  }

  /**
   * Cek apakah businessId sudah melebihi batas rate limit (12 RPM).
   * Menggunakan Redis key `quota:gemini:rpm:{businessId}` dengan sliding window 60 detik.
   */
  async isRateLimited(businessId: string): Promise<boolean> {
    const key = `quota:gemini:rpm:${businessId}`;
    try {
      const current = await this.redisService.incr(key, RATE_LIMIT_WINDOW_SECONDS);
      if (current > RATE_LIMIT_THRESHOLD) {
        this.logger.warn(
          `Gemini rate limit reached for business ${businessId}: ${current} RPM`,
        );
        return true;
      }
      return false;
    } catch (err) {
      // Fail open — jika Redis down, jangan blokir request
      this.logger.error('Failed to check Gemini rate limit', (err as Error).message);
      return false;
    }
  }

  /**
   * Ekstrak transaksi dari gambar menggunakan Gemini 1.5 Flash.
   *
   * - Rate limit dicek SEBELUM memanggil Gemini API
   * - Setelah panggilan sukses, counter rate limit sudah diincrement di `isRateLimited()`
   * - Jika response JSON tidak valid → return `{ confidence: 0, items: [], rawOcrText: rawText }`
   */
  async extractReceipt(
    fileBuffer: Buffer,
    inputType?: InputType,
  ): Promise<NormalizedReceiptResult> {
    if (!this.model) {
      throw new Error('Gemini OCR provider is not configured — GEMINI_API_KEY missing');
    }

    // businessId tidak tersedia di interface OcrProvider, tapi rate limit perlu businessId.
    // Rate limit dicek di factory/worker dengan memanggil isRateLimited() sebelum extractReceipt().
    // Di sini hanya melakukan call Gemini.

    const base64Image = fileBuffer.toString('base64');
    const mimeType = this.detectMimeType(fileBuffer);

    let rawText = '';
    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: 'Analisis gambar dan kembalikan JSON sesuai format yang diminta.' },
      ]);

      const responseText = result.response.text();
      rawText = responseText;

      return this.parseGeminiResponse(responseText);
    } catch (err) {
      this.logger.error('Gemini API call failed', (err as Error).message);
      // Jangan expose error detail yang mungkin mengandung API key
      throw new Error('Gemini OCR request failed');
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Deteksi MIME type dari magic bytes buffer.
   * Fallback ke `image/jpeg` jika tidak dikenali.
   */
  private detectMimeType(
    buffer: Buffer,
  ): 'image/jpeg' | 'image/png' | 'image/webp' {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    )
      return 'image/png';
    if (
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    )
      return 'image/webp';
    return 'image/jpeg';
  }

  /**
   * Parse response text dari Gemini menjadi `NormalizedReceiptResult`.
   * Jika JSON tidak valid atau struktur tidak sesuai → return graceful fallback dengan confidence 0.
   */
  private parseGeminiResponse(responseText: string): NormalizedReceiptResult {
    // Gemini kadang membungkus JSON dalam markdown code block
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : responseText.trim();

    let parsed: GeminiJsonResponse;
    try {
      const raw: unknown = JSON.parse(jsonString);
      if (!this.isGeminiJsonResponse(raw)) {
        this.logger.warn('Gemini response JSON shape is invalid — using fallback');
        return { confidence: 0, items: [], rawOcrText: responseText };
      }
      parsed = raw;
    } catch {
      this.logger.warn('Gemini response is not valid JSON — using fallback');
      return { confidence: 0, items: [], rawOcrText: responseText };
    }

    const rawOcrText =
      typeof parsed.rawText === 'string' ? parsed.rawText : responseText;
    const overallConfidence =
      typeof parsed.overallConfidence === 'number'
        ? Math.min(1, Math.max(0, parsed.overallConfidence))
        : 0;

    const items: ParsedLineItem[] = parsed.items
      .map((item) => this.mapItem(item))
      .filter((item): item is ParsedLineItem => item !== null);

    return {
      confidence: overallConfidence,
      overallConfidence,
      items,
      rawOcrText,
    };
  }

  /**
   * Map satu item dari Gemini response ke `ParsedLineItem`.
   * Return `null` jika data tidak bisa diparsing.
   */
  private mapItem(item: GeminiResponseItem): ParsedLineItem | null {
    const description =
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : null;

    if (!description) return null;

    const amount =
      typeof item.amount === 'number' && isFinite(item.amount)
        ? Math.max(0, item.amount)
        : 0;

    const type =
      item.type === 'MASUK' || item.type === 'KELUAR' ? item.type : 'KELUAR';

    const date =
      typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
        ? item.date
        : null;

    const confidence =
      typeof item.confidence === 'number'
        ? Math.min(1, Math.max(0, item.confidence))
        : 0.5;

    return { description, amount, type, date, confidence };
  }

  /**
   * Type guard untuk memverifikasi bahwa `unknown` value memiliki shape `GeminiJsonResponse`.
   */
  private isGeminiJsonResponse(value: unknown): value is GeminiJsonResponse {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return Array.isArray(obj['items']);
  }
}
