import { IsString, IsNotEmpty, IsISO8601, MaxLength } from 'class-validator';
import { IsPositiveDecimal } from '../../../common/validators/is-positive-decimal.validator';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class CreateAssetDto {
  @IsString({ message: 'Nama aset harus berupa teks' })
  @IsNotEmpty({ message: 'Nama aset tidak boleh kosong' })
  @MaxLength(100, { message: 'Nama aset maksimal 100 karakter' })
  name: string;

  @IsPositiveDecimal({ message: 'Nilai aset harus berupa angka positif lebih dari 0' })
  @IsNotEmpty({ message: 'Nilai aset tidak boleh kosong' })
  value: string;

  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsSupportedCurrency()
  currency: string;

  @IsISO8601({}, { message: 'Tanggal perolehan harus dalam format ISO 8601' })
  @IsNotEmpty({ message: 'Tanggal perolehan tidak boleh kosong' })
  acquiredAt: string;
}
