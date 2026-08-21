import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfitLossQueryDto } from './dto/profit-loss-query.dto';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfitLoss(businessId: string, query: ProfitLossQueryDto) {
    const where: Prisma.TransactionWhereInput = {
      businessId,
      status: TransactionStatus.CONFIRMED,
      deletedAt: null,
      occurredAt: {
        gte: new Date(query.from),
        lte: new Date(query.to),
      },
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.currency && { currency: query.currency.toUpperCase() }),
    };

    // Calculate INCOME (MASUK)
    const incomeAggregations = await this.prisma.transaction.groupBy({
      by: ['currency'],
      where: {
        ...where,
        type: TransactionType.MASUK,
      },
      _sum: {
        amount: true,
      },
    });

    // Calculate EXPENSE (KELUAR)
    const expenseAggregations = await this.prisma.transaction.groupBy({
      by: ['currency'],
      where: {
        ...where,
        type: TransactionType.KELUAR,
      },
      _sum: {
        amount: true,
      },
    });

    // Combine results per currency
    const resultByCurrency: Record<string, { totalIncome: Prisma.Decimal; totalExpense: Prisma.Decimal }> = {};

    for (const inc of incomeAggregations) {
      if (!resultByCurrency[inc.currency]) {
        resultByCurrency[inc.currency] = { totalIncome: new Prisma.Decimal(0), totalExpense: new Prisma.Decimal(0) };
      }
      resultByCurrency[inc.currency].totalIncome = inc._sum.amount || new Prisma.Decimal(0);
    }

    for (const exp of expenseAggregations) {
      if (!resultByCurrency[exp.currency]) {
        resultByCurrency[exp.currency] = { totalIncome: new Prisma.Decimal(0), totalExpense: new Prisma.Decimal(0) };
      }
      resultByCurrency[exp.currency].totalExpense = exp._sum.amount || new Prisma.Decimal(0);
    }

    const report = Object.entries(resultByCurrency).map(([currency, data]) => {
      const netProfit = data.totalIncome.minus(data.totalExpense);
      return {
        currency,
        totalIncome: data.totalIncome.toString(),
        totalExpense: data.totalExpense.toString(),
        netProfit: netProfit.toString(),
      };
    });

    return {
      from: query.from,
      to: query.to,
      data: report,
    };
  }
}
