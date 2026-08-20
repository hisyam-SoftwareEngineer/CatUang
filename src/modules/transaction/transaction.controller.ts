import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { TransactionService } from './transaction.service';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  /**
   * POST /api/v1/transactions
   * Role: OWNER, STAFF
   *
   * Header wajib: Idempotency-Key (UUID, di-generate client per user action)
   * Mencegah duplikasi transaksi dari retry jaringan atau double-tap.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.OWNER, Role.STAFF)
  async create(
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.createTransaction(
      dto,
      req.user.id,
      req.user.businessId,
      idempotencyKey,
    );
  }

  /**
   * GET /api/v1/transactions
   * Role: OWNER, STAFF
   *
   * Query params: page, pageSize, accountId, from, to, includeVoided
   * Default: page=1, pageSize=20, includeVoided=false (hanya CONFIRMED)
   */
  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  async findAll(
    @Query() filters: ListTransactionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.findAll(req.user.businessId, filters);
  }

  /**
   * PATCH /api/v1/transactions/:id/void
   * Role: OWNER saja — STAFF tidak bisa void transaksi
   *
   * Membalik saldo secara atomik. Transaksi yang sudah VOID tidak bisa di-void lagi.
   */
  @Patch(':id/void')
  @Roles(Role.OWNER)
  async void(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.transactionService.voidTransaction(
      id,
      req.user.businessId,
      req.user.id,
    );
  }
}
