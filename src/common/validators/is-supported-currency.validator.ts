import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../constants/currency.constants';

@ValidatorConstraint({ async: false })
export class IsSupportedCurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return (SUPPORTED_CURRENCIES as readonly string[]).includes(
      value.toUpperCase(),
    );
  }

  defaultMessage(): string {
    return `Mata uang tidak didukung. Pilihan yang tersedia: ${SUPPORTED_CURRENCIES.join(', ')}`;
  }
}

/**
 * Custom validator: memastikan nilai currency termasuk dalam whitelist SUPPORTED_CURRENCIES.
 * Sesuai 03-backend-guide.md §4 — bukan validator ISO 4217 generik.
 */
export function IsSupportedCurrency(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSupportedCurrencyConstraint,
    });
  };
}
