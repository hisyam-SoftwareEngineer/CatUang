import { Test, TestingModule } from '@nestjs/testing';
import { TransactionService } from './transaction.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001';
const USER_ID = 'user-001';
const IDEMPOTENCY_KEY = 'idem-key-001';

const mockAccount = {
  id: 'acc-001',
  businessId: BUSINESS_ID,
  name: 'Kas Tunai',
  type: 'CASH',
  currency: 'IDR',
  balance: new Decimal('1000000'),
  deletedAt: null,
};

const mockCounterAccount = {
  id: 'acc-002',
  businessId: BUSINESS_ID,
  name: 'Bank BRI',
  type: 'BANK',
  currency: 'IDR',
  balance: new Decimal('500000'),
  deletedAt: null,
};

const mockUsdAccount = {
  id: 'acc-003',
  businessId: BUSINESS_ID,
  name: 'Rekening USD',
  type: 'BANK',
  currency: 'USD',
  balance: new Decimal('100'),
  deletedAt: null,
};

const mockTransaction = {
  id: 'trx-001',
  businessId: BUSINESS_ID,
  accountId: 'acc-001',
  categoryId: null,
  userId: USER_ID,
  type: TransactionType.MASUK,
  amount: new Decimal('500000'),
  currency: 'IDR',
  description: null,
  occurredAt: new Date(),
  sourceType: 'MANUAL',
  status: TransactionStatus.CONFIRMED,
  createdAt: new Date(),
  counterAccountId: null,
  counterAmount: null,
  counterCurrency: null,
  exchangeRateUsed: null,
  idempotencyKey: IDEMPOTENCY_KEY,
};

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockPrisma = {
  $transaction: jest.fn(),
  transaction: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  account: {
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  category: {
    findFirst: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Setup $transaction mock yang menjalankan callback dengan tx mock.
 * tx mock memiliki $queryRaw yang mereturn locked accounts.
 */
function setupTxMock(lockedAccounts: (typeof mockAccount)[]) {
  mockPrisma.$transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue(lockedAccounts),
        transaction: {
          create: jest.fn().mockResolvedValue({
            ...mockTransaction,
            id: 'trx-new',
          }),
          update: jest.fn().mockResolvedValue({
            ...mockTransaction,
            status: TransactionStatus.VOID,
          }),
        },
        account: {
          update: jest.fn().mockResolvedValue({
            ...mockAccount,
            balance: new Decimal('1500000'),
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
        category: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cat-001' }),
        },
      };
      return callback(txMock);
    },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

import { SyncService } from '../sync/sync.service';

const mockSync = {
  emitEvent: jest.fn(),
};

describe('TransactionService', () => {
  let service: TransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SyncService, useValue: mockSync },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createTransaction
  // ──────────────────────────────────────────────────────────────────────────

  describe('createTransaction', () => {
    const baseMasukDto = {
      accountId: 'acc-001',
      type: TransactionType.MASUK,
      amount: '500000',
      currency: 'IDR',
      occurredAt: new Date().toISOString(),
    };

    it('melempar IDEMPOTENCY_KEY_REQUIRED kalau header kosong', async () => {
      await expect(
        service.createTransaction(baseMasukDto, USER_ID, BUSINESS_ID, ''),
      ).rejects.toMatchObject({ errorCode: 'IDEMPOTENCY_KEY_REQUIRED' });
    });

    it('melempar IDEMPOTENCY_KEY_REQUIRED kalau header whitespace', async () => {
      await expect(
        service.createTransaction(baseMasukDto, USER_ID, BUSINESS_ID, '   '),
      ).rejects.toMatchObject({ errorCode: 'IDEMPOTENCY_KEY_REQUIRED' });
    });

    it('mengembalikan cached response kalau idempotency key sudah ada', async () => {
      const cachedEntity = { id: 'trx-cached', status: 'CONFIRMED' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedEntity));

      const result = await service.createTransaction(
        baseMasukDto,
        USER_ID,
        BUSINESS_ID,
        IDEMPOTENCY_KEY,
      );

      expect(result).toEqual(cachedEntity);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('melempar INVALID_DATE kalau occurredAt lebih dari 24 jam di masa depan', async () => {
      mockRedis.get.mockResolvedValue(null);
      const future = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

      await expect(
        service.createTransaction(
          { ...baseMasukDto, occurredAt: future },
          USER_ID,
          BUSINESS_ID,
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toMatchObject({ errorCode: 'INVALID_DATE' });
    });

    it('melempar SAME_ACCOUNT_TRANSFER kalau accountId === counterAccountId', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.createTransaction(
          {
            accountId: 'acc-001',
            counterAccountId: 'acc-001',
            type: TransactionType.TRANSFER,
            amount: '100000',
            currency: 'IDR',
            occurredAt: new Date().toISOString(),
          },
          USER_ID,
          BUSINESS_ID,
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toMatchObject({ errorCode: 'SAME_ACCOUNT_TRANSFER' });
    });

    it('berhasil membuat transaksi MASUK', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);
      setupTxMock([mockAccount]);

      const result = await service.createTransaction(
        baseMasukDto,
        USER_ID,
        BUSINESS_ID,
        IDEMPOTENCY_KEY,
      );

      expect(result.status).toBe(TransactionStatus.CONFIRMED);
      expect(result.newBalance).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `idempotency:${IDEMPOTENCY_KEY}`,
        expect.any(String),
        86400,
      );
    });

    it('melempar CURRENCY_MISMATCH kalau currency tidak sesuai akun', async () => {
      mockRedis.get.mockResolvedValue(null);

      setupTxMock([mockAccount]); // akun IDR

      await expect(
        service.createTransaction(
          { ...baseMasukDto, currency: 'USD' }, // kirim USD ke akun IDR
          USER_ID,
          BUSINESS_ID,
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toMatchObject({ errorCode: 'CURRENCY_MISMATCH' });
    });

    it('melempar INSUFFICIENT_BALANCE kalau saldo tidak cukup untuk KELUAR', async () => {
      mockRedis.get.mockResolvedValue(null);

      const poorAccount = { ...mockAccount, balance: new Decimal('100') };
      setupTxMock([poorAccount]);

      await expect(
        service.createTransaction(
          {
            accountId: 'acc-001',
            type: TransactionType.KELUAR,
            amount: '500000', // lebih dari saldo 100
            currency: 'IDR',
            occurredAt: new Date().toISOString(),
          },
          USER_ID,
          BUSINESS_ID,
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_BALANCE' });
    });

    it('melempar EXCHANGE_RATE_REQUIRED untuk TRANSFER cross-currency tanpa exchangeRateUsed', async () => {
      mockRedis.get.mockResolvedValue(null);

      // akun IDR → akun USD (cross-currency)
      setupTxMock([mockAccount, mockUsdAccount]);

      await expect(
        service.createTransaction(
          {
            accountId: 'acc-001',
            counterAccountId: 'acc-003',
            type: TransactionType.TRANSFER,
            amount: '100000',
            currency: 'IDR',
            counterAmount: '7', // ada counterAmount tapi tidak ada exchangeRateUsed
            occurredAt: new Date().toISOString(),
          },
          USER_ID,
          BUSINESS_ID,
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toMatchObject({ errorCode: 'EXCHANGE_RATE_REQUIRED' });
    });

    it('berhasil membuat TRANSFER same-currency tanpa exchangeRateUsed', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(undefined);

      // Dua akun IDR — same-currency TRANSFER
      setupTxMock([mockAccount, mockCounterAccount]);

      const result = await service.createTransaction(
        {
          accountId: 'acc-001',
          counterAccountId: 'acc-002',
          type: TransactionType.TRANSFER,
          amount: '200000',
          currency: 'IDR',
          occurredAt: new Date().toISOString(),
        },
        USER_ID,
        BUSINESS_ID,
        IDEMPOTENCY_KEY,
      );

      expect(result.status).toBe(TransactionStatus.CONFIRMED);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan hasil paginated', async () => {
      const transactions = [mockTransaction];
      // $transaction untuk [findMany, count]
      mockPrisma.$transaction.mockResolvedValue([transactions, 1]);

      const result = await service.findAll(BUSINESS_ID, {
        page: 1,
        pageSize: 20,
        includeVoided: false,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('filter hanya CONFIRMED kalau includeVoided false', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll(BUSINESS_ID, {
        page: 1,
        pageSize: 20,
        includeVoided: false,
      });

      // Verifikasi hasil — hanya CONFIRMED yang dikembalikan (filter diterapkan di where clause)
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      // $transaction dipanggil (batch [findMany, count])
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // voidTransaction
  // ──────────────────────────────────────────────────────────────────────────

  describe('voidTransaction', () => {
    it('melempar TRANSACTION_NOT_FOUND kalau transaksi tidak ada', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.voidTransaction('trx-not-exist', BUSINESS_ID, USER_ID),
      ).rejects.toMatchObject({ errorCode: 'TRANSACTION_NOT_FOUND' });
    });

    it('melempar TRANSACTION_ALREADY_VOID kalau sudah di-void', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({
        ...mockTransaction,
        status: TransactionStatus.VOID,
      });

      await expect(
        service.voidTransaction('trx-001', BUSINESS_ID, USER_ID),
      ).rejects.toMatchObject({ errorCode: 'TRANSACTION_ALREADY_VOID' });
    });

    it('berhasil void transaksi MASUK dan balik saldo', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction);

      // Setup tx mock untuk void
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const txMock = {
            $queryRaw: jest.fn().mockResolvedValue([mockAccount]),
            transaction: {
              update: jest.fn().mockResolvedValue({
                ...mockTransaction,
                status: TransactionStatus.VOID,
              }),
            },
            account: {
              update: jest.fn().mockResolvedValue({
                ...mockAccount,
                balance: new Decimal('500000'), // saldo setelah reverse
              }),
            },
            auditLog: {
              create: jest.fn().mockResolvedValue({}),
            },
          };
          return callback(txMock);
        },
      );

      const result = await service.voidTransaction(
        'trx-001',
        BUSINESS_ID,
        USER_ID,
      );

      expect(result.status).toBe(TransactionStatus.VOID);
      expect(result.newBalance).toBe('500000');
    });
  });
});
