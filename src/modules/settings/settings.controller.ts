import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { LinkWhatsappDto } from './dto/link-whatsapp.dto';
import { VerifyWhatsappDto } from './dto/verify-whatsapp.dto';
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

  // ─── WhatsApp Linking ─────────────────────────────────────────────────────

  /**
   * POST /settings/wa/link
   * Submit nomor WA → OTP dikirim ke nomor tersebut via WhatsApp
   */
  @Post('wa/link')
  @Roles(Role.OWNER, Role.STAFF)
  async linkWhatsapp(@Body() dto: LinkWhatsappDto, @Req() req: AuthRequest) {
    return this.settingsService.linkWhatsapp(req.user.id, req.user.businessId, dto);
  }

  /**
   * POST /settings/wa/verify
   * Submit kode OTP 6-digit yang diterima via WA
   */
  @Post('wa/verify')
  @Roles(Role.OWNER, Role.STAFF)
  async verifyWhatsapp(@Body() dto: VerifyWhatsappDto, @Req() req: AuthRequest) {
    return this.settingsService.verifyWhatsapp(req.user.id, req.user.businessId, dto);
  }

  /**
   * DELETE /settings/wa/unlink
   * Lepas WA dari akun ini
   */
  @Delete('wa/unlink')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER, Role.STAFF)
  async unlinkWhatsapp(@Req() req: AuthRequest) {
    return this.settingsService.unlinkWhatsapp(req.user.id, req.user.businessId);
  }
}

