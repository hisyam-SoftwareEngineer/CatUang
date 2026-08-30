import { NlpParserService, IntentType } from './nlp-parser.service';

describe('NlpParserService', () => {
  let parser: NlpParserService;

  beforeEach(() => {
    parser = new NlpParserService();
  });

  // ─── Keyword commands ─────────────────────────────────────────────────────

  it('parses "saldo"', () => {
    expect(parser.parse('saldo').type).toBe(IntentType.SALDO);
  });

  it('parses "batal"', () => {
    expect(parser.parse('batal').type).toBe(IntentType.BATAL);
  });

  it('parses "bantuan"', () => {
    expect(parser.parse('bantuan').type).toBe(IntentType.BANTUAN);
  });

  it('parses "help"', () => {
    expect(parser.parse('help').type).toBe(IntentType.BANTUAN);
  });

  it('parses "laporan"', () => {
    const result = parser.parse('laporan');
    expect(result.type).toBe(IntentType.LAPORAN);
    expect(result.period).toBe('hari_ini');
  });

  it('parses "laporan minggu ini"', () => {
    const result = parser.parse('laporan minggu ini');
    expect(result.type).toBe(IntentType.LAPORAN);
    expect(result.period).toBe('minggu_ini');
  });

  // ─── MASUK patterns ───────────────────────────────────────────────────────

  it('parses "masuk 500rb dari jual nasi"', () => {
    const result = parser.parse('masuk 500rb dari jual nasi');
    expect(result.type).toBe(IntentType.MASUK);
    expect(result.amount).toBe(500000);
    expect(result.description).toBe('jual nasi');
  });

  it('parses "masuk 2jt transfer pelanggan"', () => {
    const result = parser.parse('masuk 2jt transfer pelanggan');
    expect(result.type).toBe(IntentType.MASUK);
    expect(result.amount).toBe(2000000);
  });

  it('parses "300rb masuk dari pelanggan" (reversed pattern)', () => {
    const result = parser.parse('300rb masuk dari pelanggan');
    expect(result.type).toBe(IntentType.MASUK);
    expect(result.amount).toBe(300000);
    expect(result.description).toBe('pelanggan');
  });

  // ─── KELUAR patterns ──────────────────────────────────────────────────────

  it('parses "keluar 200rb buat beli beras"', () => {
    const result = parser.parse('keluar 200rb buat beli beras');
    expect(result.type).toBe(IntentType.KELUAR);
    expect(result.amount).toBe(200000);
    expect(result.description).toBe('beli beras');
  });

  it('parses "keluar 50ribu listrik" (no buat/untuk)', () => {
    const result = parser.parse('keluar 50ribu listrik');
    expect(result.type).toBe(IntentType.KELUAR);
    expect(result.amount).toBe(50000);
    expect(result.description).toBe('listrik');
  });

  it('parses "keluar 1,5jt untuk bayar supplier"', () => {
    const result = parser.parse('keluar 1,5jt untuk bayar supplier');
    expect(result.type).toBe(IntentType.KELUAR);
    expect(result.amount).toBe(1500000);
    expect(result.description).toBe('bayar supplier');
  });

  // ─── Unknown ──────────────────────────────────────────────────────────────

  it('returns UNKNOWN for gibberish', () => {
    expect(parser.parse('halo apa kabar').type).toBe(IntentType.UNKNOWN);
  });
});
