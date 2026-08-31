import { IsString, IsOptional, IsISO8601, MaxLength } from 'class-validator';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class UpdateAssetDto {
  @IsOptional()
  @IsString({ message: 'Nama aset harus berupa teks' })
  @MaxLength(100, { message: 'Nama aset maksimal 100 karakter' })
  name?: string;

  @IsOptional()
  @IsPositiveDecimal({ message: 'Nilai aset harus berupa angka positif lebih dari 0' })
  value?: string;

  @IsOptional()
  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tanggal perolehan harus dalam format ISO 8601' })
  acquiredAt?: string;
}
