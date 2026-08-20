import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AccountType } from '@prisma/client';
import { IsSupportedCurrency } from '../../../common/validators/is-supported-currency.validator';

export class CreateAccountDto {
  @IsString({ message: 'Nama akun harus berupa teks' })
  @IsNotEmpty({ message: 'Nama akun tidak boleh kosong' })
  name: string;

  @IsEnum(AccountType, {
    message: `Tipe akun tidak valid. Pilihan: ${Object.values(AccountType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Tipe akun tidak boleh kosong' })
  type: AccountType;

  @IsString({ message: 'Mata uang harus berupa teks' })
  @IsNotEmpty({ message: 'Mata uang tidak boleh kosong' })
  @IsSupportedCurrency()
  currency: string;
}
