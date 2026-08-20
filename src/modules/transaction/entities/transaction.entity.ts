import {
  TransactionSourceType,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

/**
 * Response shape untuk Transaction — terpisah dari Prisma model.
 * Semua nilai Decimal direpresentasikan sebagai string untuk menghindari
 * floating point precision issues di JSON serialization.
 */
export class TransactionEntity {
  id: string;
  businessId: string;
  accountId: string;
  categoryId: string | null;
  userId: string;
  type: TransactionType;
  /** String representasi Decimal — BUKAN number */
  amount: string;
  currency: string;
  description: string | null;
  occurredAt: Date;
  sourceType: TransactionSourceType;
  status: TransactionStatus;
  createdAt: Date;

  // TRANSFER fields
  counterAccountId: string | null;
  /** String representasi Decimal — null kalau bukan TRANSFER */
  counterAmount: string | null;
  counterCurrency: string | null;
  /** String representasi Decimal precision 18,6 — null kalau bukan cross-currency TRANSFER */
  exchangeRateUsed: string | null;

  /**
   * Saldo akun SETELAH transaksi ini diterapkan.
   * Hanya ada di response POST (create) dan PATCH (void) — tidak ada di GET list.
   */
  newBalance?: string;

  constructor(partial: Partial<TransactionEntity>) {
    Object.assign(this, partial);
  }
}
