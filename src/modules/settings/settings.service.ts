import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AuditAction } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        realtimeSyncEnabled: true,
        ocrProviderPriority: true,
        ocrProviderEnabled: true,
        ocrQuotaThresholdPercent: true,
        defaultExportFormat: true,
        defaultPdfTemplate: true,
        enableMultiCurrency: true,
        waLinked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Bisnis tidak ditemukan');
    }

    return business;
  }

  async updateSettings(businessId: string, userId: string, dto: UpdateSettingsDto) {
    // Verifikasi bisnis ada dan ambil semua field settings yang dibutuhkan untuk audit log
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        realtimeSyncEnabled: true,
        ocrProviderPriority: true,
        ocrProviderEnabled: true,
        ocrQuotaThresholdPercent: true,
        defaultExportFormat: true,
        defaultPdfTemplate: true,
        enableMultiCurrency: true,
        waLinked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Bisnis tidak ditemukan');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.business.update({
        where: { id: businessId },
        data: {
          ...(dto.baseCurrency !== undefined && { baseCurrency: dto.baseCurrency }),
          ...(dto.realtimeSyncEnabled !== undefined && { realtimeSyncEnabled: dto.realtimeSyncEnabled }),
          ...(dto.ocrProviderPriority !== undefined && { ocrProviderPriority: dto.ocrProviderPriority }),
          ...(dto.ocrProviderEnabled !== undefined && { ocrProviderEnabled: dto.ocrProviderEnabled }),
          ...(dto.ocrQuotaThresholdPercent !== undefined && { ocrQuotaThresholdPercent: dto.ocrQuotaThresholdPercent }),
          ...(dto.defaultExportFormat !== undefined && { defaultExportFormat: dto.defaultExportFormat }),
          ...(dto.defaultPdfTemplate !== undefined && { defaultPdfTemplate: dto.defaultPdfTemplate }),
          ...(dto.enableMultiCurrency !== undefined && { enableMultiCurrency: dto.enableMultiCurrency }),
        },
      });

      // Rekam Audit Log manual karena ini mengubah state Business
      await tx.auditLog.create({
        data: {
          businessId,
          userId,
          entityType: 'BusinessSettings',
          entityId: businessId,
          action: AuditAction.UPDATE,
          beforeState: {
            baseCurrency: existing.baseCurrency,
            realtimeSyncEnabled: existing.realtimeSyncEnabled,
            ocrProviderPriority: existing.ocrProviderPriority,
            ocrProviderEnabled: existing.ocrProviderEnabled,
            ocrQuotaThresholdPercent: existing.ocrQuotaThresholdPercent,
            defaultExportFormat: existing.defaultExportFormat,
            defaultPdfTemplate: existing.defaultPdfTemplate,
            enableMultiCurrency: existing.enableMultiCurrency,
          },
          afterState: {
            baseCurrency: result.baseCurrency,
            realtimeSyncEnabled: result.realtimeSyncEnabled,
            ocrProviderPriority: result.ocrProviderPriority,
            ocrProviderEnabled: result.ocrProviderEnabled,
            ocrQuotaThresholdPercent: result.ocrQuotaThresholdPercent,
            defaultExportFormat: result.defaultExportFormat,
            defaultPdfTemplate: result.defaultPdfTemplate,
            enableMultiCurrency: result.enableMultiCurrency,
          },
        },
      });

      return result;
    });

    return {
      id: updated.id,
      name: updated.name,
      baseCurrency: updated.baseCurrency,
      realtimeSyncEnabled: updated.realtimeSyncEnabled,
      ocrProviderPriority: updated.ocrProviderPriority,
      ocrProviderEnabled: updated.ocrProviderEnabled,
      ocrQuotaThresholdPercent: updated.ocrQuotaThresholdPercent,
      defaultExportFormat: updated.defaultExportFormat,
      defaultPdfTemplate: updated.defaultPdfTemplate,
      enableMultiCurrency: updated.enableMultiCurrency,
      waLinked: updated.waLinked,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
