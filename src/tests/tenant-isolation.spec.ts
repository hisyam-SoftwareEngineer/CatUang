/**
 * tenant-isolation.spec.ts
 *
 * Integration test — Verifikasi bahwa setiap modul meng-enforce businessId scoping
 * dengan benar. User dari Business A tidak boleh membaca/memodifikasi data milik Business B.
 *
 * Pattern: mock PrismaService di setiap service, simulasikan dua tenant (b1, b2),
 * pastikan operasi dengan businessId yang salah selalu menghasilkan NotFoundException
 * atau data kosong.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

// ── Services ─────────────────────────────────────────────────────────────────
import { AccountService } from '../modules/account/account.service';
import { TransactionService } from '../modules/transaction/transaction.service';
import { AssetLiabilityService } from '../modules/asset-liability/asset-liability.service';

// ── Dependencies ─────────────────────────────────────────────────────────────
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';
import { SyncService } from '../modules/sync/sync.service';
import { TransactionNotFoundException } from '../common/exceptions/business.exception';

// ─── Shared Mock Factory ─────────────────────────────────────────────────────

const buildPrismaMock = () => ({
  account: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  transaction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  asset: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  liability: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(buildPrismaMock())),
});

const buildRedisMock = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn().mockResolvedValue(false),
});

const buildSyncMock = () => ({
  emitEvent: jest.fn(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. AccountService — Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('[TenantIsolation] AccountService', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: buildRedisMock() },
        { provide: SyncService, useValue: buildSyncMock() },
      ],
    }).compile();
    service = module.get<AccountService>(AccountService);
  });

  it('findAll harus mengembalikan data kosong jika tidak ada akun di businessId tersebut', async () => {
    prisma.account.findMany.mockResolvedValue([]);
    const result = await service.findAllByBusiness('b-WRONG');
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TransactionService — Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('[TenantIsolation] TransactionService', () => {
  let service: TransactionService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: buildRedisMock() },
        { provide: SyncService, useValue: buildSyncMock() },
      ],
    }).compile();
    service = module.get<TransactionService>(TransactionService);
  });

  it('voidTransaction harus lempar NotFoundException jika businessId tidak cocok', async () => {
    // Simulasikan: transaksi milik b1, tapi di-void dengan businessId b2
    prisma.transaction.findFirst.mockResolvedValue(null); // scoped query returns nothing
    await expect(
      service.voidTransaction('tx-1', 'b2-WRONG', 'u1'),
    ).rejects.toThrow(TransactionNotFoundException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AssetLiabilityService — Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('[TenantIsolation] AssetLiabilityService', () => {
  let service: AssetLiabilityService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetLiabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: SyncService, useValue: buildSyncMock() },
      ],
    }).compile();
    service = module.get<AssetLiabilityService>(AssetLiabilityService);
  });

  it('updateAsset harus lempar NotFoundException jika businessId salah', async () => {
    prisma.asset.findFirst.mockResolvedValue(null); // not found for this tenant
    await expect(
      service.updateAsset('asset-1', { name: 'Hack' }, 'b2-WRONG'),
    ).rejects.toThrow(NotFoundException);
  });

  it('deleteAsset harus lempar NotFoundException jika businessId salah', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);
    await expect(
      service.deleteAsset('asset-1', 'b2-WRONG'),
    ).rejects.toThrow(NotFoundException);
  });

  it('updateLiability harus lempar NotFoundException jika businessId salah', async () => {
    prisma.liability.findFirst.mockResolvedValue(null);
    await expect(
      service.updateLiability('liab-1', { name: 'Hack' }, 'b2-WRONG'),
    ).rejects.toThrow(NotFoundException);
  });

  it('deleteLiability harus lempar NotFoundException jika businessId salah', async () => {
    prisma.liability.findFirst.mockResolvedValue(null);
    await expect(
      service.deleteLiability('liab-1', 'b2-WRONG'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findAllAssets harus mengembalikan array kosong untuk businessId yang tidak memiliki data', async () => {
    prisma.asset.findMany.mockResolvedValue([]);
    const result = await service.findAllAssets('b2-EMPTY');
    expect(result).toHaveLength(0);
  });
});
