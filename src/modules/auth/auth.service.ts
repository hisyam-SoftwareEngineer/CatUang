import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role, User } from '@prisma/client';
import { CategoryService } from '../category/category.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly categoryService: CategoryService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'EMAIL_ALREADY_REGISTERED',
        message:
          'Email sudah terdaftar. Silakan gunakan email lain atau login.',
        timestamp: new Date().toISOString(),
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(registerDto.password, salt);

    // Run in transaction: Create business, user, and default settings
    const result = await this.prisma.$transaction(async (prisma) => {
      const business = await prisma.business.create({
        data: {
          name: registerDto.businessName,
        },
      });

      const user = await prisma.user.create({
        data: {
          email: registerDto.email,
          passwordHash,
          role: Role.OWNER,
          businessId: business.id,
        },
      });

      return { user, business };
    });

    // Seed default categories — diluar $transaction karena tidak kritikal untuk atomicity
    await this.categoryService.seedDefaults(result.business.id);

    return this.generateTokens(result.user);
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Email atau password salah',
        timestamp: new Date().toISOString(),
      });
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Email atau password salah',
        timestamp: new Date().toISOString(),
      });
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    // 1. Verify token string signature using refresh secret
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Sesi anda telah berakhir, silakan login kembali',
        timestamp: new Date().toISOString(),
      });
    }

    // Hash the raw token string to look it up in DB
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: hashedToken },
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Token tidak ditemukan',
        timestamp: new Date().toISOString(),
      });
    }

    if (storedToken.isRevoked) {
      // TOKEN REUSE DETECTED: Revoke the entire family
      await this.prisma.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'TOKEN_REUSE_DETECTED',
        message:
          'Sesi bermasalah terdeteksi. Silakan login kembali demi keamanan',
        timestamp: new Date().toISOString(),
      });
    }

    // Token is valid. Invalidate it (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Pengguna tidak ditemukan',
        timestamp: new Date().toISOString(),
      });
    }

    // Generate new tokens in the same family
    return this.generateTokens(user, storedToken.family);
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;

    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { token: hashedToken },
      data: { isRevoked: true },
    });
  }

  private async generateTokens(user: User, family?: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshTokenString = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshTokenString)
      .digest('hex');
    const tokenFamily = family || crypto.randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        family: tokenFamily,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenString,
      user: {
        id: user.id,
        role: user.role,
        businessId: user.businessId,
      },
    };
  }
}
