export interface NormalizedReceiptResult {
  merchantName?: string;
  totalAmount?: number;
  date?: string; // ISO 8601 string
  rawText?: string;
  confidence: number;
}

export interface OcrProvider {
  name: string;
  extractReceipt(fileBuffer: Buffer): Promise<NormalizedReceiptResult>;
}
