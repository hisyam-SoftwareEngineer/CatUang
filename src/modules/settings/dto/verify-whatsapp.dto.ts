import { IsString, Length } from 'class-validator';

export class VerifyWhatsappDto {
  @IsString()
  @Length(6, 6, { message: 'Kode OTP harus 6 digit' })
  code: string;
}
