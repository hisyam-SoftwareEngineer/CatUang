import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Memvalidasi bahwa string merepresentasikan angka Decimal yang valid dan lebih dari 0.
 * Dipakai untuk field `amount`, `counterAmount`, `exchangeRateUsed` di DTO transaksi.
 *
 * Menerima: "500000", "500000.50", "0.01"
 * Menolak: "0", "-100", "abc", "", null
 */
@ValidatorConstraint({ async: false })
export class IsPositiveDecimalConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    // Cek format angka valid (digit dengan opsional titik desimal)
    if (!/^\d+(\.\d+)?$/.test(value)) return false;

    try {
      const decimal = new Decimal(value);
      return decimal.greaterThan(0);
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'Nilai harus berupa angka positif (lebih dari 0)';
  }
}

/**
 * @IsPositiveDecimal — memastikan field berisi string representasi Decimal > 0.
 * Gunakan ini untuk semua field uang di DTO, bukan @IsNumber() atau @IsDecimal().
 */
export function IsPositiveDecimal(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPositiveDecimalConstraint,
    });
  };
}
