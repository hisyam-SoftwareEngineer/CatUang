import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import * as crypto from 'crypto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setCookies(res: Response, refreshToken: string, csrfToken: string) {
    // Refresh Token cookie (httpOnly)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    // CSRF Token cookie (readable by JS)
    res.cookie('csrf-token', csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    this.setCookies(res, result.refreshToken, csrfToken);

    return {
      userId: result.user.id,
      businessId: result.user.businessId,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    this.setCookies(res, result.refreshToken, csrfToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies as Record<string, string> | undefined)?.['refreshToken'] ??
      '';
    const result = await this.authService.refresh(token);

    // Refresh CSRF token on rotation (optional but good practice)
    const csrfToken = crypto.randomBytes(32).toString('hex');
    this.setCookies(res, result.refreshToken, csrfToken);

    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token =
      (req.cookies as Record<string, string> | undefined)?.['refreshToken'] ??
      '';
    await this.authService.logout(token);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.clearCookie('csrf-token', {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
    });

    return { success: true };
  }
}
