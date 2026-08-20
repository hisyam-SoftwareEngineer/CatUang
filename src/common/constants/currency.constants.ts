/**
 * Whitelist mata uang yang didukung (sesuai 01-architecture.md §4.6).
 * Bukan full ISO 4217 — hanya 7 currency relevan untuk UMKM Indonesia.
 *
 * PENTING: Konstanta ini adalah satu-satunya sumber kebenaran untuk daftar currency.
 * Jangan menduplikasi daftar ini di file lain — selalu import dari sini.
 */
export const SUPPORTED_CURRENCIES = [
  'IDR',
  'USD',
  'SGD',
  'MYR',
  'EUR',
  'CNY',
  'AUD',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
