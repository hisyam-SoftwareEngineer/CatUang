import { Test, TestingModule } from '@nestjs/testing';
import { AssetLiabilityService } from './asset-liability.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { NotFoundException } from '@nestjs/common';

describe('AssetLiabilityService', () => {
  let service: AssetLiabilityService;
  let prisma: PrismaService;

  const mockPrisma = {
    asset: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    liability: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSyncService = {
    emitEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetLiabilityService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: SyncService,
          useValue: mockSyncService,
        },
      ],
    }).compile();

    service = module.get<AssetLiabilityService>(AssetLiabilityService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAsset', () => {
    it('should create an asset successfully', async () => {
      const mockResult = {
        id: 'a1',
        name: 'Gedung Toko',
        value: 500000000,
        currency: 'IDR',
        acquiredAt: new Date(),
        businessId: 'b1',
      };
      mockPrisma.asset.create.mockResolvedValue(mockResult);

      const result = await service.createAsset(
        {
          name: 'Gedung Toko',
          value: '500000000',
          currency: 'IDR',
          acquiredAt: new Date().toISOString(),
        },
        'b1',
      );

      expect(result.id).toBe('a1');
      expect(result.name).toBe('Gedung Toko');
      expect(prisma.asset.create).toHaveBeenCalled();
    });
  });

  describe('updateAsset', () => {
    it('should throw NotFoundException if asset not found/unauthorized', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAsset('invalid', { name: 'New' }, 'b1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update an asset successfully', async () => {
      const existing = {
        id: 'a1',
        name: 'Gedung Toko',
        value: 500000000,
        currency: 'IDR',
        acquiredAt: new Date(),
        businessId: 'b1',
      };
      mockPrisma.asset.findFirst.mockResolvedValue(existing);
      mockPrisma.asset.update.mockResolvedValue({ ...existing, name: 'Gedung Baru' });

      const result = await service.updateAsset('a1', { name: 'Gedung Baru' }, 'b1');
      expect(result.name).toBe('Gedung Baru');
      expect(prisma.asset.update).toHaveBeenCalled();
    });
  });
});
