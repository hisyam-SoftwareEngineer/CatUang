import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryEntity } from './entities/category.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

/** Default categories seeded saat OWNER register atau buat kategori pertama kali */
const DEFAULT_CATEGORIES = [
  'Penjualan',
  'Jasa',
  'Pembelian Bahan Baku',
  'Gaji & Upah',
  'Sewa Tempat',
  'Listrik & Air',
  'Transportasi',
  'Pemasaran',
  'Lain-lain',
] as const;

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inisialisasi kategori default untuk business baru.
   * Dipanggil oleh AuthService saat register — bukan endpoint publik.
   */
  async seedDefaults(businessId: string): Promise<void> {
    await this.prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({
        businessId,
        name,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Membuat kategori kustom baru untuk business.
   * Nama kategori tidak boleh duplikat dalam satu business (case-insensitive).
   */
  async create(
    dto: CreateCategoryDto,
    businessId: string,
  ): Promise<CategoryEntity> {
    const existing = await this.prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: dto.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BusinessException(
        'CATEGORY_ALREADY_EXISTS',
        `Kategori "${dto.name}" sudah ada. Silakan gunakan nama lain.`,
        HttpStatus.CONFLICT,
      );
    }

    const category = await this.prisma.category.create({
      data: {
        businessId,
        name: dto.name,
        isDefault: false,
      },
    });

    return new CategoryEntity({
      id: category.id,
      name: category.name,
      isDefault: category.isDefault,
      createdAt: category.createdAt,
    });
  }

  /**
   * Mengembalikan semua kategori aktif untuk business.
   * Default categories ditampilkan lebih dulu, lalu kustom urut alfabet.
   */
  async findAll(businessId: string): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      orderBy: [
        { isDefault: 'desc' }, // default categories muncul lebih dulu
        { name: 'asc' },
      ],
    });

    return categories.map(
      (c) =>
        new CategoryEntity({
          id: c.id,
          name: c.name,
          isDefault: c.isDefault,
          createdAt: c.createdAt,
        }),
    );
  }

  /**
   * Mengupdate nama kategori kustom.
   * Kategori default tidak bisa diubah namanya oleh user.
   */
  async update(
    id: string,
    dto: UpdateCategoryDto,
    businessId: string,
  ): Promise<CategoryEntity> {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!category) {
      throw new BusinessException(
        'CATEGORY_NOT_FOUND',
        'Kategori tidak ditemukan atau sudah dihapus',
        HttpStatus.NOT_FOUND,
      );
    }

    if (category.isDefault) {
      throw new BusinessException(
        'CATEGORY_DEFAULT_IMMUTABLE',
        'Kategori bawaan sistem tidak bisa diubah. Buat kategori baru jika diperlukan.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Cek duplikasi nama (kecuali dengan dirinya sendiri)
    const duplicate = await this.prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: dto.name, mode: 'insensitive' },
        deletedAt: null,
        NOT: { id },
      },
    });

    if (duplicate) {
      throw new BusinessException(
        'CATEGORY_ALREADY_EXISTS',
        `Kategori "${dto.name}" sudah ada. Silakan gunakan nama lain.`,
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { name: dto.name },
    });

    return new CategoryEntity({
      id: updated.id,
      name: updated.name,
      isDefault: updated.isDefault,
      createdAt: updated.createdAt,
    });
  }

  /**
   * Soft-delete kategori kustom.
   * Kategori default tidak bisa dihapus.
   * Kategori yang masih dipakai di Transaction tidak bisa dihapus.
   */
  async remove(id: string, businessId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!category) {
      throw new BusinessException(
        'CATEGORY_NOT_FOUND',
        'Kategori tidak ditemukan atau sudah dihapus',
        HttpStatus.NOT_FOUND,
      );
    }

    if (category.isDefault) {
      throw new BusinessException(
        'CATEGORY_DEFAULT_IMMUTABLE',
        'Kategori bawaan sistem tidak bisa dihapus.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Cek apakah masih dipakai di transaksi aktif
    const usedCount = await this.prisma.transaction.count({
      where: {
        categoryId: id,
        deletedAt: null,
      },
    });

    if (usedCount > 0) {
      throw new BusinessException(
        'CATEGORY_IN_USE',
        `Kategori ini masih digunakan oleh ${usedCount} transaksi dan tidak bisa dihapus.`,
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Dipakai oleh TransactionService untuk validasi categoryId saat buat transaksi.
   */
  async findOneByIdAndBusiness(
    id: string,
    businessId: string,
  ): Promise<CategoryEntity> {
    const category = await this.prisma.category.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!category) {
      throw new BusinessException(
        'CATEGORY_NOT_FOUND',
        'Kategori tidak ditemukan atau sudah dihapus',
        HttpStatus.NOT_FOUND,
      );
    }

    return new CategoryEntity({
      id: category.id,
      name: category.name,
      isDefault: category.isDefault,
      createdAt: category.createdAt,
    });
  }
}
