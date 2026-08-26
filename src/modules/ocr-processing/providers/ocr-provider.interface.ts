import { InputType } from '@prisma/client';

export interface ParsedLineItem {
  description: string;
  amount: number; // Nilai nominal (dikonversi ke Decimal saat simpan ke DB)
  type: 'MASUK' | 'KELUAR';
  date: string | null; // ISO 8601 atau null jika tidak tersedia
  confidence: number; // 0.0 - 1.0
}

export interface NormalizedReceiptResult {
  // Field existing (backward compatible)
  merchantName?: string;
  totalAmount?: number;
  date?: string; // ISO 8601 string
  rawText?: string;
  confidence: number;

  // Field baru untuk handwritten scan
  items?: ParsedLineItem[]; // Array item — isi jika inputType = HANDWRITTEN
  rawOcrText?: string; // Teks mentah dari provider
  overallConfidence?: number; // Confidence keseluruhan halaman
}

export interface OcrProvider {
  name: string;
  supportedInputTypes?: InputType[];
  extractReceipt(
    fileBuffer: Buffer,
    inputType?: InputType,
  ): Promise<NormalizedReceiptResult>;
}
