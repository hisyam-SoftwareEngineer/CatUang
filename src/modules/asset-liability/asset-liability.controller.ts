import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AssetLiabilityService } from './asset-liability.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateLiabilityDto } from './dto/create-liability.dto';
import { UpdateLiabilityDto } from './dto/update-liability.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('asset-liability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetLiabilityController {
  constructor(private readonly service: AssetLiabilityService) {}

  // ─── ASSETS ──────────────────────────────────────────────────────────────

  @Post('assets')
  @Roles(Role.OWNER, Role.STAFF)
  async createAsset(@Body() dto: CreateAssetDto, @Req() req: AuthRequest) {
    return this.service.createAsset(dto, req.user.businessId);
  }

  @Get('assets')
  @Roles(Role.OWNER, Role.STAFF)
  async findAllAssets(@Req() req: AuthRequest) {
    return this.service.findAllAssets(req.user.businessId);
  }

  @Patch('assets/:id')
  @Roles(Role.OWNER)
  async updateAsset(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateAsset(id, dto, req.user.businessId);
  }

  @Delete('assets/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER)
  async deleteAsset(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.deleteAsset(id, req.user.businessId);
  }

  // ─── LIABILITIES ─────────────────────────────────────────────────────────

  @Post('liabilities')
  @Roles(Role.OWNER, Role.STAFF)
  async createLiability(@Body() dto: CreateLiabilityDto, @Req() req: AuthRequest) {
    return this.service.createLiability(dto, req.user.businessId);
  }

  @Get('liabilities')
  @Roles(Role.OWNER, Role.STAFF)
  async findAllLiabilities(@Req() req: AuthRequest) {
    return this.service.findAllLiabilities(req.user.businessId);
  }

  @Patch('liabilities/:id')
  @Roles(Role.OWNER)
  async updateLiability(
    @Param('id') id: string,
    @Body() dto: UpdateLiabilityDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateLiability(id, dto, req.user.businessId);
  }

  @Delete('liabilities/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER)
  async deleteLiability(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.deleteLiability(id, req.user.businessId);
  }
}
