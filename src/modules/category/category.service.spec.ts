import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

const BUSINESS_ID = 'biz-001';

// Mock PrismaService — tidak menyentuh database nyata
const mockPrisma = {
  category: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  transaction: {
    count: jest.fn(),
  },
};

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    jest.clearAllMocks();
  });

  // ─── create ────────────────────────────────────────────

  describe('create', () => {
    it('berhasil membuat kategori baru', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null); // tidak ada duplikat
      mockPrisma.category.create.mockResolvedValue({
        id: 'cat-1',
        name: 'Penjualan Khusus',
        isDefault: false,
        createdAt: new Date(),
      });

      const result = await service.create(
        { name: 'Penjualan Khusus' },
        BUSINESS_ID,
      );

      expect(result.name).toBe('Penjualan Khusus');
      expect(result.isDefault).toBe(false);
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: {
          businessId: BUSINESS_ID,
          name: 'Penjualan Khusus',
          isDefault: false,
        },
      });
    });

    it('melempar CATEGORY_ALREADY_EXISTS jika nama sudah ada', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-existing',
        name: 'Penjualan',
      });

      await expect(
        service.create({ name: 'Penjualan' }, BUSINESS_ID),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: 'CATEGORY_ALREADY_EXISTS',
        }) as BusinessException,
      );
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });
  });

  // ─── findAll ────────────────────────────────────────────

  describe('findAll', () => {
    it('mengembalikan semua kategori terurut default dulu', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'c1', name: 'Penjualan', isDefault: true, createdAt: new Date() },
        { id: 'c2', name: 'Custom', isDefault: false, createdAt: new Date() },
      ]);

      const result = await service.findAll(BUSINESS_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessId: BUSINESS_ID, deletedAt: null },
        }),
      );
    });
  });

  // ─── update ────────────────────────────────────────────

  describe('update', () => {
    it('berhasil update nama kategori kustom', async () => {
      mockPrisma.category.findFirst
        .mockResolvedValueOnce({ id: 'cat-1', name: 'Lama', isDefault: false }) // cari kategori
        .mockResolvedValueOnce(null); // tidak ada duplikat nama baru

      mockPrisma.category.update.mockResolvedValue({
        id: 'cat-1',
        name: 'Baru',
        isDefault: false,
        createdAt: new Date(),
      });

      const result = await service.update(
        'cat-1',
        { name: 'Baru' },
        BUSINESS_ID,
      );
      expect(result.name).toBe('Baru');
    });

    it('melempar CATEGORY_NOT_FOUND jika kategori tidak ada', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('cat-x', { name: 'Test' }, BUSINESS_ID),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: 'CATEGORY_NOT_FOUND',
        }) as BusinessException,
      );
    });

    it('melempar CATEGORY_DEFAULT_IMMUTABLE jika kategori adalah default', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Penjualan',
        isDefault: true,
      });

      await expect(
        service.update('cat-1', { name: 'Baru' }, BUSINESS_ID),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: 'CATEGORY_DEFAULT_IMMUTABLE',
        }) as BusinessException,
      );
    });
  });

  // ─── remove ────────────────────────────────────────────

  describe('remove', () => {
    it('berhasil soft-delete kategori kustom yang tidak dipakai', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Custom',
        isDefault: false,
      });
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.category.update.mockResolvedValue({});

      await expect(service.remove('cat-1', BUSINESS_ID)).resolves.not.toThrow();
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { deletedAt: expect.any(Date) as Date },
      });
    });

    it('melempar CATEGORY_DEFAULT_IMMUTABLE jika kategori default', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Penjualan',
        isDefault: true,
      });

      await expect(service.remove('cat-1', BUSINESS_ID)).rejects.toThrow(
        expect.objectContaining({
          errorCode: 'CATEGORY_DEFAULT_IMMUTABLE',
        }) as BusinessException,
      );
    });

    it('melempar CATEGORY_IN_USE jika masih ada transaksi yang pakai kategori ini', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Custom',
        isDefault: false,
      });
      mockPrisma.transaction.count.mockResolvedValue(5); // masih dipakai

      await expect(service.remove('cat-1', BUSINESS_ID)).rejects.toThrow(
        expect.objectContaining({
          errorCode: 'CATEGORY_IN_USE',
        }) as BusinessException,
      );
      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });
  });

  // ─── findOneByIdAndBusiness ──────────────────────────

  describe('findOneByIdAndBusiness', () => {
    it('mengembalikan kategori yang valid', async () => {
      mockPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Penjualan',
        isDefault: true,
        createdAt: new Date(),
      });

      const result = await service.findOneByIdAndBusiness('cat-1', BUSINESS_ID);
      expect(result.id).toBe('cat-1');
    });

    it('melempar CATEGORY_NOT_FOUND jika tidak ditemukan', async () => {
      mockPrisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneByIdAndBusiness('cat-x', BUSINESS_ID),
      ).rejects.toMatchObject({ errorCode: 'CATEGORY_NOT_FOUND' });
    });
  });
});
