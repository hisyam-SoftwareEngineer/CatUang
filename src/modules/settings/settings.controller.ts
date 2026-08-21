import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  async getSettings(@Req() req: AuthRequest) {
    return this.settingsService.getSettings(req.user.businessId);
  }

  @Patch()
  @Roles(Role.OWNER)
  async updateSettings(
    @Body() updateSettingsDto: UpdateSettingsDto,
    @Req() req: AuthRequest,
  ) {
    return this.settingsService.updateSettings(
      req.user.businessId,
      req.user.id,
      updateSettingsDto,
    );
  }
}
