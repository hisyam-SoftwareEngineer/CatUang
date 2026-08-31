import { IsString, IsNotEmpty, IsISO8601, IsOptional, MaxLength } from 'class-validator';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class CreateLiabilityDto {
  @IsString({ message: 'Nama liabilitas harus berupa teks' })
  @IsNotEmpty({ message: 'Nama liabilitas tidak boleh kosong' })
  @MaxLength(100, { message: 'Nama liabilitas maksimal 100 karakter' })
  name: string;

  @IsPositiveDecimal({ message: 'Jumlah liabilitas harus berupa angka positif lebih dari 0' })
  @IsNotEmpty({ message: 'Jumlah liabilitas tidak boleh kosong' })
  amount: string;

  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsSupportedCurrency()
  currency: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Tanggal jatuh tempo harus dalam format ISO 8601' })
  dueDate?: string;
}
