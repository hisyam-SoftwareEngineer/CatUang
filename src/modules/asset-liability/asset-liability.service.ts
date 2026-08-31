import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateLiabilityDto } from './dto/create-liability.dto';
import { UpdateLiabilityDto } from './dto/update-liability.dto';
import { AssetEntity } from './entities/asset.entity';
import { LiabilityEntity } from './entities/liability.entity';

@Injectable()
export class AssetLiabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  // ─── ASSETS ──────────────────────────────────────────────────────────────

  async createAsset(dto: CreateAssetDto, businessId: string): Promise<AssetEntity> {
    const asset = await this.prisma.asset.create({
      data: {
        name: dto.name,
        value: dto.value,
        currency: dto.currency.toUpperCase(),
        acquiredAt: new Date(dto.acquiredAt),
        businessId,
      },
    });

    const entity = new AssetEntity({
      id: asset.id,
      name: asset.name,
      value: asset.value.toString(),
      currency: asset.currency,
      acquiredAt: asset.acquiredAt.toISOString(),
    });

    this.syncService.emitEvent(businessId, 'asset.created', entity);

    return entity;
  }

  async findAllAssets(businessId: string): Promise<AssetEntity[]> {
    const assets = await this.prisma.asset.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return assets.map(
      (a) =>
        new AssetEntity({
          id: a.id,
          name: a.name,
          value: a.value.toString(),
          currency: a.currency,
          acquiredAt: a.acquiredAt.toISOString(),
        }),
    );
  }

  async updateAsset(
    id: string,
    dto: UpdateAssetDto,
    businessId: string,
  ): Promise<AssetEntity> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException('Aset tidak ditemukan');
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.acquiredAt !== undefined && { acquiredAt: new Date(dto.acquiredAt) }),
      },
    });

    const entity = new AssetEntity({
      id: updated.id,
      name: updated.name,
      value: updated.value.toString(),
      currency: updated.currency,
      acquiredAt: updated.acquiredAt.toISOString(),
    });

    this.syncService.emitEvent(businessId, 'asset.updated', entity);

    return entity;
  }

  async deleteAsset(id: string, businessId: string): Promise<{ message: string }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException('Aset tidak ditemukan');
    }

    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.syncService.emitEvent(businessId, 'asset.deleted', { id });

    return { message: 'Aset berhasil dihapus' };
  }

  // ─── LIABILITIES ─────────────────────────────────────────────────────────

  async createLiability(
    dto: CreateLiabilityDto,
    businessId: string,
  ): Promise<LiabilityEntity> {
    const liability = await this.prisma.liability.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        businessId,
      },
    });

    const entity = new LiabilityEntity({
      id: liability.id,
      name: liability.name,
      amount: liability.amount.toString(),
      currency: liability.currency,
      dueDate: liability.dueDate?.toISOString(),
    });

    this.syncService.emitEvent(businessId, 'liability.created', entity);

    return entity;
  }

  async findAllLiabilities(businessId: string): Promise<LiabilityEntity[]> {
    const liabilities = await this.prisma.liability.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return liabilities.map(
      (l) =>
        new LiabilityEntity({
          id: l.id,
          name: l.name,
          amount: l.amount.toString(),
          currency: l.currency,
          dueDate: l.dueDate?.toISOString(),
        }),
    );
  }

  async updateLiability(
    id: string,
    dto: UpdateLiabilityDto,
    businessId: string,
  ): Promise<LiabilityEntity> {
    const liability = await this.prisma.liability.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!liability) {
      throw new NotFoundException('Liabilitas tidak ditemukan');
    }

    const updated = await this.prisma.liability.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
      },
    });

    const entity = new LiabilityEntity({
      id: updated.id,
      name: updated.name,
      amount: updated.amount.toString(),
      currency: updated.currency,
      dueDate: updated.dueDate?.toISOString(),
    });

    this.syncService.emitEvent(businessId, 'liability.updated', entity);

    return entity;
  }

  async deleteLiability(id: string, businessId: string): Promise<{ message: string }> {
    const liability = await this.prisma.liability.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!liability) {
      throw new NotFoundException('Liabilitas tidak ditemukan');
    }

    await this.prisma.liability.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.syncService.emitEvent(businessId, 'liability.deleted', { id });

    return { message: 'Liabilitas berhasil dihapus' };
  }
}
