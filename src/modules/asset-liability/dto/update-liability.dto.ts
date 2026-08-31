import { IsString, IsOptional, IsISO8601, MaxLength } from 'class-validator';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class UpdateLiabilityDto {
  @IsOptional()
  @IsString({ message: 'Nama liabilitas harus berupa teks' })
  @MaxLength(100, { message: 'Nama liabilitas maksimal 100 karakter' })
  name?: string;

  @IsOptional()
  @IsPositiveDecimal({ message: 'Jumlah liabilitas harus berupa angka positif lebih dari 0' })
  amount?: string;

  @IsOptional()
  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsSupportedCurrency()
  currency?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tanggal jatuh tempo harus dalam format ISO 8601' })
  dueDate?: string;
}
