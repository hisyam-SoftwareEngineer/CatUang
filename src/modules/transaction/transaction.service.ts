import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { TransactionEntity } from './entities/transaction.entity';
import {
  CurrencyMismatchException,
  ExchangeRateRequiredException,
  IdempotencyKeyRequiredException,
  InsufficientBalanceException,
  InvalidTransactionDateException,
  SameAccountTransferException,
  TransactionAlreadyVoidException,
  TransactionNotFoundException,
} from '../../common/exceptions/business.exception';
import {
  Account,
  AuditAction,
  Prisma,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/** TTL idempotency key di Redis: 24 jam */
const IDEMPOTENCY_TTL_SECONDS = 86_400;

/** Transaksi tidak boleh lebih dari 24 jam di masa depan */
const MAX_FUTURE_HOURS = 24;

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Membuat transaksi baru (MASUK, KELUAR, atau TRANSFER) secara atomik.
   *
   * Alur:
   * 1. Validasi idempotency key — kembalikan cached response kalau sudah ada
   * 2. Validasi tanggal — tidak boleh terlalu jauh di masa depan
   * 3. Validasi akun & kategori (ownership + aktif)
   * 4. Validasi aturan bisnis per type
   * 5. Eksekusi dalam prisma.$transaction dengan row lock
   * 6. Cache response ke Redis
   */
  async createTransaction(
    dto: CreateTransactionDto,
    userId: string,
    businessId: string,
    idempotencyKey: string,
  ): Promise<TransactionEntity> {
    // ── Guard: idempotency key wajib ──────────────────────────────────────
    if (!idempotencyKey?.trim()) {
      throw new IdempotencyKeyRequiredException();
    }

    // ── Guard: cek cache idempotency ──────────────────────────────────────
    const cacheKey = `idempotency:${idempotencyKey}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log(`Idempotency hit: ${idempotencyKey}`);
      return JSON.parse(cached) as TransactionEntity;
    }

    // ── Guard: validasi tanggal ───────────────────────────────────────────
    const occurredAt = new Date(dto.occurredAt);
    const maxFuture = new Date(Date.now() + MAX_FUTURE_HOURS * 60 * 60 * 1000);
    if (occurredAt > maxFuture) {
      throw new InvalidTransactionDateException();
    }

    // ── Guard: TRANSFER — accountId !== counterAccountId ─────────────────
    if (
      dto.type === TransactionType.TRANSFER &&
      dto.accountId === dto.counterAccountId
    ) {
      throw new SameAccountTransferException();
    }

    const amount = new Decimal(dto.amount);

    // ── Eksekusi atomik ───────────────────────────────────────────────────
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Lock akun asal (dan tujuan untuk TRANSFER)
        const lockedAccounts = await this.lockAccounts(
          tx,
          businessId,
          dto.accountId,
          dto.type === TransactionType.TRANSFER
            ? dto.counterAccountId
            : undefined,
        );

        const account = lockedAccounts.find((a) => a.id === dto.accountId);
        if (!account) {
          // AccountNotFoundException tidak dilempar dari dalam tx — akan di-rollback otomatis
          throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), {
            isAccountNotFound: true,
          });
        }

        // 2. Validasi currency MASUK/KELUAR
        if (
          dto.type !== TransactionType.TRANSFER &&
          dto.currency.toUpperCase() !== account.currency.toUpperCase()
        ) {
          throw new CurrencyMismatchException();
        }

        // 3. Validasi saldo untuk KELUAR
        if (dto.type === TransactionType.KELUAR) {
          if (account.balance.lessThan(amount)) {
            throw new InsufficientBalanceException();
          }
        }

        // 4. Logika TRANSFER
        let counterAccount: Account | undefined;
        let counterAmount: Decimal | undefined;
        let counterCurrency: string | undefined;
        let exchangeRateUsed: Decimal | undefined;

        if (dto.type === TransactionType.TRANSFER) {
          counterAccount = lockedAccounts.find(
            (a) => a.id === dto.counterAccountId,
          );
          if (!counterAccount) {
            throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), {
              isAccountNotFound: true,
            });
          }

          counterCurrency = counterAccount.currency;
          const isCrossCurrency =
            account.currency.toUpperCase() !==
            counterAccount.currency.toUpperCase();

          if (isCrossCurrency) {
            // Cross-currency: counterAmount & exchangeRateUsed wajib dari client
            if (!dto.exchangeRateUsed) {
              throw new ExchangeRateRequiredException();
            }
            if (!dto.counterAmount) {
              // counterAmount wajib untuk cross-currency
              throw new ExchangeRateRequiredException();
            }
            exchangeRateUsed = new Decimal(dto.exchangeRateUsed);
            counterAmount = new Decimal(dto.counterAmount);
          } else {
            // Same-currency: counterAmount = amount, exchangeRateUsed = 1
            counterAmount = amount;
            exchangeRateUsed = new Decimal(1);
          }

          // Validasi saldo sumber untuk TRANSFER
          if (account.balance.lessThan(amount)) {
            throw new InsufficientBalanceException();
          }
        }

        // 5. Validasi kategori (opsional — hanya kalau diberikan)
        if (dto.categoryId) {
          const category = await tx.category.findFirst({
            where: { id: dto.categoryId, businessId, deletedAt: null },
          });
          if (!category) {
            throw Object.assign(new Error('CATEGORY_NOT_FOUND'), {
              isCategoryNotFound: true,
            });
          }
        }

        // 6. Hitung delta balance
        let balanceDelta: Decimal;
        if (dto.type === TransactionType.MASUK) {
          balanceDelta = amount;
        } else if (dto.type === TransactionType.KELUAR) {
          balanceDelta = amount.negated();
        } else {
          // TRANSFER: sumber berkurang
          balanceDelta = amount.negated();
        }

        // 7. Insert Transaction record
        const transaction = await tx.transaction.create({
          data: {
            businessId,
            accountId: dto.accountId,
            categoryId: dto.categoryId ?? null,
            userId,
            type: dto.type,
            amount,
            currency: dto.currency.toUpperCase(),
            description: dto.description ?? null,
            occurredAt,
            sourceType: 'MANUAL',
            status: TransactionStatus.CONFIRMED,
            idempotencyKey,
            // TRANSFER fields
            counterAccountId: dto.counterAccountId ?? null,
            counterAmount: counterAmount ?? null,
            counterCurrency: counterCurrency ?? null,
            exchangeRateUsed: exchangeRateUsed ?? null,
          },
        });

        // 8. Update balance akun asal
        const updatedAccount = await tx.account.update({
          where: { id: dto.accountId },
          data: {
            balance: { increment: balanceDelta },
          },
        });

        // 9. Update balance akun tujuan (TRANSFER)
        if (
          dto.type === TransactionType.TRANSFER &&
          counterAccount &&
          counterAmount
        ) {
          await tx.account.update({
            where: { id: counterAccount.id },
            data: {
              balance: {
                increment: counterAmount,
              },
            },
          });
        }

        // 10. AuditLog — CREATE (hanya afterState karena ini operasi baru)
        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            entityType: 'Transaction',
            entityId: transaction.id,
            action: AuditAction.CREATE,
            afterState: {
              type: transaction.type,
              amount: transaction.amount.toString(),
              currency: transaction.currency,
              accountId: transaction.accountId,
              status: transaction.status,
            },
          },
        });

        return { transaction, newBalance: updatedAccount.balance };
      },
      {
        // Serializable isolation memastikan row lock benar-benar efektif
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );

    // ── Buat entity response ──────────────────────────────────────────────
    const entity = this.toEntity(
      result.transaction,
      result.newBalance.toString(),
    );

    // ── Cache ke Redis ────────────────────────────────────────────────────
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(entity),
        IDEMPOTENCY_TTL_SECONDS,
      );
    } catch (err) {
      // Fail-open: kalau Redis down, transaksi tetap sukses
      this.logger.warn(
        `Gagal cache idempotency key ${idempotencyKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return entity;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Mengambil daftar transaksi dengan pagination dan filter.
   * Filter occurredAt menggunakan tanggal transaksi (bukan createdAt).
   */
  async findAll(
    businessId: string,
    filters: ListTransactionsDto,
  ): Promise<{
    items: TransactionEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.TransactionWhereInput = {
      businessId,
      deletedAt: null,
      ...(filters.accountId && { accountId: filters.accountId }),
      ...(!filters.includeVoided && { status: TransactionStatus.CONFIRMED }),
      ...((filters.from || filters.to) && {
        occurredAt: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
    };

    const skip = (filters.page - 1) * filters.pageSize;

    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: filters.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      items: transactions.map((t) => this.toEntity(t)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VOID
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Membatalkan (void) transaksi dan membalik dampaknya pada saldo secara atomik.
   *
   * Alur:
   * 1. Cari transaksi — validasi kepemilikan businessId
   * 2. Guard: sudah VOID → TRANSACTION_ALREADY_VOID
   * 3. Lock akun yang terdampak
   * 4. Balik saldo (reverse delta)
   * 5. Update status ke VOID
   * 6. AuditLog inline dengan beforeState + afterState
   */
  async voidTransaction(
    id: string,
    businessId: string,
    userId: string,
  ): Promise<TransactionEntity> {
    // Cari transaksi dulu di luar tx (read-only, cepat)
    const existing = await this.prisma.transaction.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new TransactionNotFoundException();
    }

    if (existing.status === TransactionStatus.VOID) {
      throw new TransactionAlreadyVoidException();
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Lock semua akun yang terdampak
        const accountIds = [existing.accountId];
        if (existing.counterAccountId)
          accountIds.push(existing.counterAccountId);
        const sortedIds = accountIds.sort(); // sort untuk menghindari deadlock

        const lockedAccounts = await tx.$queryRaw<Account[]>`
          SELECT * FROM "Account"
          WHERE id = ANY(${sortedIds}::text[])
          AND "businessId" = ${businessId}
          AND "deletedAt" IS NULL
          ORDER BY id ASC
          FOR UPDATE
        `;

        const account = lockedAccounts.find((a) => a.id === existing.accountId);
        if (!account) {
          throw Object.assign(new Error('ACCOUNT_NOT_FOUND'), {
            isAccountNotFound: true,
          });
        }

        // Hitung reverse delta
        const amount = existing.amount;
        let reverseDelta: Decimal;

        if (existing.type === TransactionType.MASUK) {
          reverseDelta = amount.negated(); // MASUK di-void → kurangi saldo
        } else if (existing.type === TransactionType.KELUAR) {
          reverseDelta = amount; // KELUAR di-void → tambah saldo
        } else {
          // TRANSFER di-void → kembalikan ke asal, kurangi dari tujuan
          reverseDelta = amount; // akun asal +amount
        }

        // Update status transaksi ke VOID
        const voided = await tx.transaction.update({
          where: { id },
          data: { status: TransactionStatus.VOID },
        });

        // Balik saldo akun asal
        const updatedAccount = await tx.account.update({
          where: { id: existing.accountId },
          data: {
            balance: { increment: reverseDelta },
          },
        });

        // Balik saldo akun tujuan (TRANSFER)
        if (
          existing.type === TransactionType.TRANSFER &&
          existing.counterAccountId &&
          existing.counterAmount
        ) {
          await tx.account.update({
            where: { id: existing.counterAccountId },
            data: {
              balance: {
                increment: existing.counterAmount.negated(),
              },
            },
          });
        }

        // AuditLog inline — butuh beforeState (interceptor tidak bisa capture ini)
        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            entityType: 'Transaction',
            entityId: id,
            action: AuditAction.UPDATE,
            beforeState: {
              status: existing.status,
              amount: existing.amount.toString(),
            },
            afterState: {
              status: TransactionStatus.VOID,
            },
          },
        });

        return { transaction: voided, newBalance: updatedAccount.balance };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );

    return this.toEntity(result.transaction, result.newBalance.toString());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Lock satu atau dua akun dengan SELECT FOR UPDATE.
   * Selalu sort by ID ascending untuk mencegah deadlock.
   */
  private async lockAccounts(
    tx: Prisma.TransactionClient,
    businessId: string,
    accountId: string,
    counterAccountId?: string,
  ): Promise<Account[]> {
    const ids = counterAccountId
      ? [accountId, counterAccountId].sort()
      : [accountId];

    return tx.$queryRaw<Account[]>`
      SELECT * FROM "Account"
      WHERE id = ANY(${ids}::text[])
      AND "businessId" = ${businessId}
      AND "deletedAt" IS NULL
      ORDER BY id ASC
      FOR UPDATE
    `;
  }

  /**
   * Convert Prisma Transaction record ke TransactionEntity (response shape).
   * Semua Decimal dikonversi ke string untuk menghindari precision issues.
   */
  private toEntity(
    transaction: Transaction,
    newBalance?: string,
  ): TransactionEntity {
    return new TransactionEntity({
      id: transaction.id,
      businessId: transaction.businessId,
      accountId: transaction.accountId,
      categoryId: transaction.categoryId ?? null,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      description: transaction.description ?? null,
      occurredAt: transaction.occurredAt,
      sourceType: transaction.sourceType,
      status: transaction.status,
      createdAt: transaction.createdAt,
      counterAccountId: transaction.counterAccountId ?? null,
      counterAmount: transaction.counterAmount?.toString() ?? null,
      counterCurrency: transaction.counterCurrency ?? null,
      exchangeRateUsed: transaction.exchangeRateUsed?.toString() ?? null,
      ...(newBalance !== undefined && { newBalance }),
    });
  }
}
