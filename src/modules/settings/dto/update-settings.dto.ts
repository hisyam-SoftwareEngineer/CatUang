import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum ExportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
  XLSX = 'XLSX',
  JSON = 'JSON',
  XML = 'XML',
}

export enum PdfTemplate {
  SIMPLE = 'SIMPLE',
  KUR = 'KUR',
  DETAILED = 'DETAILED',
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'baseCurrency harus kode ISO 4217 huruf kapital (contoh: IDR)' })
  baseCurrency?: string;

  @IsOptional()
  @IsBoolean()
  realtimeSyncEnabled?: boolean;

  @IsOptional()
  @IsString()
  ocrProviderPriority?: string;

  @IsOptional()
  @IsBoolean()
  ocrProviderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  ocrQuotaThresholdPercent?: number;

  @IsOptional()
  @IsEnum(ExportFormat)
  defaultExportFormat?: string;

  @IsOptional()
  @IsEnum(PdfTemplate)
  defaultPdfTemplate?: string;

  @IsOptional()
  @IsBoolean()
  enableMultiCurrency?: boolean;
}
