import {
  IsNotEmpty,
  IsString,
  IsISO8601,
  IsNumberString,
  Length,
  Matches,
} from 'class-validator';

export class CreateExchangeRateDto {
  @IsString()
  @Length(3, 3, { message: 'fromCurrency harus tepat 3 karakter (kode ISO 4217)' })
  @Matches(/^[A-Z]{3}$/, { message: 'fromCurrency harus huruf kapital (contoh: USD, IDR)' })
  @IsNotEmpty()
  fromCurrency: string;

  @IsString()
  @Length(3, 3, { message: 'toCurrency harus tepat 3 karakter (kode ISO 4217)' })
  @Matches(/^[A-Z]{3}$/, { message: 'toCurrency harus huruf kapital (contoh: USD, IDR)' })
  @IsNotEmpty()
  toCurrency: string;

  /** Nilai kurs (misal: "15750.000000" untuk 1 USD = 15750 IDR) */
  @IsNumberString({}, { message: 'rate harus berupa angka positif' })
  @IsNotEmpty()
  rate: string;

  /** Tanggal mulai berlaku kurs ini (ISO 8601, contoh: "2026-08-01") */
  @IsISO8601({}, { message: 'effectiveDate harus format ISO 8601 (contoh: 2026-08-01)' })
  @IsNotEmpty()
  effectiveDate: string;
}
