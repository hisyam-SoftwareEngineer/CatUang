import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString({ message: 'Nama kategori harus berupa teks' })
  @IsNotEmpty({ message: 'Nama kategori tidak boleh kosong' })
  @MaxLength(100, { message: 'Nama kategori maksimal 100 karakter' })
  name: string;
}
