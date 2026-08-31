import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AccountEntity } from './entities/account.entity';
import { AccountNotFoundException } from '../../common/exceptions/business.exception';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  /**
   * Membuat akun baru milik business pengguna.
   * Balance awal selalu 0 — perubahan saldo hanya melalui modul Transaction.
   */
  async create(
    dto: CreateAccountDto,
    businessId: string,
  ): Promise<AccountEntity> {
    const account = await this.prisma.account.create({
      data: {
        name: dto.name,
        type: dto.type,
        currency: dto.currency.toUpperCase(),
        businessId,
      },
    });

    const entity = new AccountEntity({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString(),
    });

    this.syncService.emitEvent(businessId, 'account.created', entity);

    return entity;
  }

  /**
   * Mengembalikan semua akun aktif (belum di-soft-delete) untuk business tertentu.
   * Dipanggil oleh modul lain (transaction, report) via service — bukan langsung ke Prisma.
   */
  async findAllByBusiness(businessId: string): Promise<AccountEntity[]> {
    const accounts = await this.prisma.account.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return accounts.map(
      (account) =>
        new AccountEntity({
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          balance: account.balance.toString(),
        }),
    );
  }

  /**
   * Mencari akun berdasarkan ID dan businessId.
   * Digunakan oleh modul Transaction untuk validasi kepemilikan akun.
   */
  async findOneByIdAndBusiness(
    id: string,
    businessId: string,
  ): Promise<AccountEntity> {
    const account = await this.prisma.account.findFirst({
      where: {
        id,
        businessId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new AccountNotFoundException();
    }

    return new AccountEntity({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: account.balance.toString(),
    });
  }
}
