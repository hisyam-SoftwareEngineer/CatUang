import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class ProfitLossQueryDto {
  /** Tanggal awal periode (ISO 8601, contoh: "2026-01-01") */
  @IsISO8601({}, { message: 'from harus format ISO 8601 (contoh: 2026-01-01)' })
  @IsNotEmpty({ message: 'from (tanggal awal) tidak boleh kosong' })
  from: string;

  /** Tanggal akhir periode (ISO 8601, contoh: "2026-12-31") */
  @IsISO8601({}, { message: 'to harus format ISO 8601 (contoh: 2026-12-31)' })
  @IsNotEmpty({ message: 'to (tanggal akhir) tidak boleh kosong' })
  to: string;

  /** Filter berdasarkan akun tertentu (opsional) */
  @IsOptional()
  @IsUUID('all', { message: 'accountId harus UUID yang valid' })
  accountId?: string;

  /** Filter berdasarkan mata uang tertentu (opsional, contoh: "IDR") */
  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'currency harus 3 karakter (kode ISO 4217)' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency harus huruf kapital (contoh: IDR, USD)' })
  currency?: string;
}
