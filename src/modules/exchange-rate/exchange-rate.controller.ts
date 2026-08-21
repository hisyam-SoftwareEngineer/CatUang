import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ListExchangeRatesDto } from './dto/list-exchange-rates.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Post()
  @Roles(Role.OWNER)
  async create(@Body() createExchangeRateDto: CreateExchangeRateDto, @Req() req: AuthRequest) {
    return this.exchangeRateService.create(createExchangeRateDto, req.user.businessId, req.user.id);
  }

  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  async findAll(@Query() query: ListExchangeRatesDto, @Req() req: AuthRequest) {
    return this.exchangeRateService.findAll(req.user.businessId, query);
  }
}
