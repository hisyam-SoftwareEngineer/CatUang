import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TransactionType } from '@prisma/client';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class CreateTransactionDto {
  @IsUUID('all', { message: 'accountId harus berupa UUID yang valid' })
  @IsNotEmpty({ message: 'accountId tidak boleh kosong' })
  accountId: string;

  @IsOptional()
  @IsUUID('all', { message: 'categoryId harus berupa UUID yang valid' })
  categoryId?: string;

  @IsEnum(TransactionType, {
    message: `Tipe transaksi tidak valid. Pilihan: ${Object.values(TransactionType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Tipe transaksi tidak boleh kosong' })
  type: TransactionType;

  /**
   * Nilai transaksi — selalu positif sebagai string Decimal.
   * Arah uang (masuk/keluar) ditentukan oleh `type`, bukan tanda negatif.
   */
  @IsPositiveDecimal({
    message: 'Jumlah harus berupa angka positif lebih dari 0',
  })
  @IsNotEmpty({ message: 'Jumlah transaksi tidak boleh kosong' })
  amount: string;

  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsSupportedCurrency()
  currency: string;

  @IsISO8601({}, { message: 'Tanggal transaksi harus dalam format ISO 8601' })
  @IsNotEmpty({ message: 'Tanggal transaksi tidak boleh kosong' })
  occurredAt: string;

  @IsOptional()
  @IsString({ message: 'Keterangan harus berupa teks' })
  @MaxLength(500, { message: 'Keterangan maksimal 500 karakter' })
  description?: string;

  // ─── TRANSFER fields ─────────────────────────────────────────────────────

  /**
   * Akun tujuan — wajib untuk TRANSFER, harus berbeda dari accountId.
   * counterCurrency TIDAK perlu dikirim client — diambil otomatis dari counterAccount.
   */
  @ValidateIf((o: CreateTransactionDto) => o.type === TransactionType.TRANSFER)
  @IsUUID('all', { message: 'counterAccountId harus berupa UUID yang valid' })
  @IsNotEmpty({
    message: 'counterAccountId wajib diisi untuk transaksi TRANSFER',
  })
  counterAccountId?: string;

  /**
   * Nilai yang masuk ke akun tujuan — wajib untuk TRANSFER lintas-currency.
   * Untuk TRANSFER same-currency: tidak perlu diisi (otomatis sama dengan amount).
   */
  @IsOptional()
  @IsPositiveDecimal({
    message: 'counterAmount harus berupa angka positif lebih dari 0',
  })
  counterAmount?: string;

  /**
   * Kurs yang dipakai saat transfer — wajib untuk TRANSFER lintas-currency.
   * Client WAJIB mengisi ini secara eksplisit — backend tidak menghitung otomatis
   * supaya angka laporan historis bisa diaudit kapan pun (prinsip transparansi kurs).
   */
  @IsOptional()
  @IsPositiveDecimal({
    message: 'exchangeRateUsed harus berupa angka positif lebih dari 0',
  })
  exchangeRateUsed?: string;
}
