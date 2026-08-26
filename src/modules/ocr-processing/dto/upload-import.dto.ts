import { IsEnum, IsOptional } from 'class-validator';
import { InputType } from '@prisma/client';

export class UploadImportDto {
  @IsOptional()
  @IsEnum(InputType, {
    message: `inputType tidak valid. Pilihan: ${Object.values(InputType).join(', ')}`,
  })
  inputType?: InputType = InputType.RECEIPT;
}
