import { Injectable } from '@nestjs/common';
import { parseNominal } from './nominal-parser';

export enum IntentType {
  MASUK = 'MASUK',
  KELUAR = 'KELUAR',
  LAPORAN = 'LAPORAN',
  SALDO = 'SALDO',
  BATAL = 'BATAL',
  BANTUAN = 'BANTUAN',
  UNKNOWN = 'UNKNOWN'
}

export interface ParsedIntent {
  type: IntentType;
  amount?: number;
  description?: string;
  period?: 'hari_ini' | 'minggu_ini' | 'bulan_ini';
}

@Injectable()
export class NlpParserService {
  parse(text: string): ParsedIntent {
    const t = text.trim().toLowerCase();

    // 1. Single keyword commands
    if (t === 'saldo') return { type: IntentType.SALDO };
    if (t === 'batal') return { type: IntentType.BATAL };
    if (t === 'bantuan' || t === 'help') return { type: IntentType.BANTUAN };
    if (t === 'laporan') return { type: IntentType.LAPORAN, period: 'hari_ini' };
    if (t === 'laporan minggu ini') return { type: IntentType.LAPORAN, period: 'minggu_ini' };

    // 2. Transaction commands
    // Pattern 1: masuk {nominal} dari {keterangan}
    let match = t.match(/^(masuk)\s+([0-9.,]+[a-z]*)\s+(?:dari\s+)?(.*)$/);
    if (match) {
      const amount = parseNominal(match[2]);
      if (amount) return { type: IntentType.MASUK, amount, description: match[3] };
    }

    // Pattern 2: keluar {nominal} (buat|untuk|) {keterangan}
    match = t.match(/^(keluar)\s+([0-9.,]+[a-z]*)\s+(?:buat\s+|untuk\s+)?(.*)$/);
    if (match) {
      const amount = parseNominal(match[2]);
      if (amount) return { type: IntentType.KELUAR, amount, description: match[3] };
    }

    // Pattern 3: {nominal} masuk (dari|) {keterangan}
    match = t.match(/^([0-9.,]+[a-z]*)\s+(masuk)\s+(?:dari\s+)?(.*)$/);
    if (match) {
      const amount = parseNominal(match[1]);
      if (amount) return { type: IntentType.MASUK, amount, description: match[3] };
    }

    return { type: IntentType.UNKNOWN };
  }
}
