import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListTransactionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page harus berupa bilangan bulat' })
  @Min(1, { message: 'page minimal 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize harus berupa bilangan bulat' })
  @Min(1, { message: 'pageSize minimal 1' })
  @Max(100, { message: 'pageSize maksimal 100' })
  pageSize: number = 20;

  /** Filter berdasarkan akun tertentu */
  @IsOptional()
  @IsUUID('all', { message: 'accountId harus berupa UUID yang valid' })
  accountId?: string;

  /** Filter occurredAt >= from (ISO 8601 date string) */
  @IsOptional()
  @IsISO8601({}, { message: 'from harus dalam format ISO 8601' })
  from?: string;

  /** Filter occurredAt <= to (ISO 8601 date string) */
  @IsOptional()
  @IsISO8601({}, { message: 'to harus dalam format ISO 8601' })
  to?: string;

  /**
   * Kalau false (default): hanya kembalikan transaksi CONFIRMED.
   * Kalau true: kembalikan CONFIRMED + VOID.
   */
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean({ message: 'includeVoided harus berupa boolean' })
  includeVoided: boolean = false;
}
