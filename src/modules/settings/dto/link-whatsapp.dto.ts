import { IsString, Matches, Length } from 'class-validator';

export class LinkWhatsappDto {
  /**
   * Nomor WA dalam format internasional tanpa '+' atau '-'.
   * Contoh: 6281234567890
   */
  @IsString()
  @Matches(/^628\d{8,12}$/, {
    message:
      'Nomor WA harus diawali 628 dan terdiri dari 11-15 digit (format: 628xxxxxxxxxx)',
  })
  phoneNumber: string;
}
