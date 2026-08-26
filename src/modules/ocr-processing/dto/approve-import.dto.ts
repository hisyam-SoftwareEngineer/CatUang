import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';

export class ApproveLineItemDto {
  @IsNotEmpty({ message: 'Deskripsi tidak boleh kosong' })
  @IsString()
  description: string;

  @IsPositiveDecimal({ message: 'Jumlah harus berupa angka positif (lebih dari 0)' })
  amount: string;

  @IsEnum(TransactionType, {
    message: `Tipe transaksi tidak valid. Pilihan: ${Object.values(TransactionType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Tipe transaksi tidak boleh kosong' })
  type: TransactionType;

  @IsISO8601({}, { message: 'Tanggal transaksi harus dalam format ISO 8601' })
  @IsNotEmpty({ message: 'Tanggal transaksi tidak boleh kosong' })
  occurredAt: string;

  @IsUUID('all', { message: 'accountId harus berupa UUID yang valid' })
  @IsNotEmpty({ message: 'accountId tidak boleh kosong' })
  accountId: string;

  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsString()
  currency: string;

  @IsOptional()
  @IsUUID('all', { message: 'categoryId harus berupa UUID yang valid' })
  categoryId?: string;
}

export class ApproveImportDto {
  @IsUUID('all', { message: 'accountId harus berupa UUID yang valid' })
  @IsNotEmpty({ message: 'accountId tidak boleh kosong' })
  accountId: string;

  @IsEnum(TransactionType, {
    message: `Tipe transaksi tidak valid. Pilihan: ${Object.values(TransactionType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Tipe transaksi tidak boleh kosong' })
  type: TransactionType;

  @IsNotEmpty({ message: 'Jumlah transaksi tidak boleh kosong' })
  @IsString()
  amount: string;

  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsString()
  currency: string;

  @IsISO8601({}, { message: 'Tanggal transaksi harus dalam format ISO 8601' })
  @IsNotEmpty({ message: 'Tanggal transaksi tidak boleh kosong' })
  occurredAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID('all')
  categoryId?: string;

  @IsOptional()
  @IsUUID('all')
  counterAccountId?: string;

  @IsOptional()
  @IsString()
  counterAmount?: string;

  @IsOptional()
  @IsString()
  exchangeRateUsed?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveLineItemDto)
  selectedItems?: ApproveLineItemDto[];
}
