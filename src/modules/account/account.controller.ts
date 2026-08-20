import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { Role, AuditAction } from '@prisma/client';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /**
   * POST /api/v1/accounts — Membuat akun baru.
   * Role: OWNER saja (STAFF tidak boleh membuat akun).
   */
  @Post()
  @Roles(Role.OWNER)
  @AuditLog('Account', AuditAction.CREATE)
  async create(
    @Body() createAccountDto: CreateAccountDto,
    @Req() req: { user: { businessId: string } },
  ) {
    return this.accountService.create(createAccountDto, req.user.businessId);
  }

  /**
   * GET /api/v1/accounts — Menampilkan semua akun milik business.
   * Role: OWNER dan STAFF.
   */
  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  async findAll(@Req() req: { user: { businessId: string } }) {
    const items = await this.accountService.findAllByBusiness(
      req.user.businessId,
    );
    return { items };
  }
}
