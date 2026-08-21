import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ListExchangeRatesDto } from './dto/list-exchange-rates.dto';
import { AuditAction } from '@prisma/client';

@Injectable()
export class ExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExchangeRateDto, businessId: string, userId: string) {
    const exchangeRate = await this.prisma.$transaction(async (tx) => {
      const rate = await tx.exchangeRate.create({
        data: {
          businessId,
          fromCurrency: dto.fromCurrency.toUpperCase(),
          toCurrency: dto.toCurrency.toUpperCase(),
          rate: dto.rate,
          effectiveDate: new Date(dto.effectiveDate),
        },
      });

      await tx.auditLog.create({
        data: {
          businessId,
          userId,
          entityType: 'ExchangeRate',
          entityId: rate.id,
          action: AuditAction.CREATE,
          afterState: {
            fromCurrency: rate.fromCurrency,
            toCurrency: rate.toCurrency,
            rate: rate.rate.toString(),
            effectiveDate: rate.effectiveDate,
          },
        },
      });

      return rate;
    });

    return {
      ...exchangeRate,
      rate: exchangeRate.rate.toString(),
    };
  }

  async findAll(businessId: string, filters: ListExchangeRatesDto) {
    const where = {
      businessId,
      ...(filters.fromCurrency && { fromCurrency: filters.fromCurrency.toUpperCase() }),
      ...(filters.toCurrency && { toCurrency: filters.toCurrency.toUpperCase() }),
    };

    const skip = (filters.page - 1) * filters.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.exchangeRate.findMany({
        where,
        orderBy: { effectiveDate: 'desc' },
        skip,
        take: filters.pageSize,
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);

    return {
      items: items.map(item => ({ ...item, rate: item.rate.toString() })),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async findLatest(businessId: string, fromCurrency: string, toCurrency: string) {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        businessId,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        effectiveDate: { lte: new Date() },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!rate) return null;

    return {
      ...rate,
      rate: rate.rate.toString(),
    };
  }
}
