import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export enum ReportType {
  PROFIT_LOSS = 'PROFIT_LOSS',
  ASSET_POSITION = 'ASSET_POSITION',
}

export enum ReportMode {
  PER_CURRENCY = 'PER_CURRENCY',
  COMBINED = 'COMBINED',
}

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

export class CreateExportDto {
  @IsEnum(ReportType, { message: 'reportType harus berupa PROFIT_LOSS atau ASSET_POSITION' })
  @IsNotEmpty()
  reportType: string;

  @IsEnum(ReportMode, { message: 'mode harus berupa PER_CURRENCY atau COMBINED' })
  @IsNotEmpty()
  mode: string;

  @IsEnum(ExportFormat, { message: 'format harus berupa PDF, CSV, XLSX, JSON, atau XML' })
  @IsNotEmpty()
  format: string;

  @IsOptional()
  @IsEnum(PdfTemplate)
  template?: string;

  @IsISO8601({}, { message: 'from harus berupa tanggal ISO 8601' })
  @IsNotEmpty()
  from: string;

  @IsISO8601({}, { message: 'to harus berupa tanggal ISO 8601' })
  @IsNotEmpty()
  to: string;
}
