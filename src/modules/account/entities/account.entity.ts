import { AccountType } from '@prisma/client';

/**
 * Response shape untuk Account — terpisah dari Prisma model.
 * Sesuai 03-backend-guide.md §1: entities/ berisi response shape.
 */
export class AccountEntity {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: string; // String representation dari Decimal, bukan number/float

  constructor(partial: Partial<AccountEntity>) {
    Object.assign(this, partial);
  }
}
