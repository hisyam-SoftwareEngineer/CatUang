import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WhatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { LinkWhatsappDto } from './dto/link-whatsapp.dto';
import { VerifyWhatsappDto } from './dto/verify-whatsapp.dto';
import { AuditAction } from '@prisma/client';

/** OTP TTL: 10 menit */
const OTP_TTL_SECONDS: number = 600;
/** Maksimum percobaan verifikasi OTP yang salah sebelum OTP diinvalidasi */
const OTP_MAX_ATTEMPTS: number = 5;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly waBot: WhatsappBotService,
  ) {}

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        realtimeSyncEnabled: true,
        ocrProviderPriority: true,
        ocrProviderEnabled: true,
        ocrQuotaThresholdPercent: true,
        defaultExportFormat: true,
        defaultPdfTemplate: true,
        enableMultiCurrency: true,
        waLinked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Bisnis tidak ditemukan');
    }

    return business;
  }

  async updateSettings(businessId: string, userId: string, dto: UpdateSettingsDto) {
    // Verifikasi bisnis ada dan ambil semua field settings yang dibutuhkan untuk audit log
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        realtimeSyncEnabled: true,
        ocrProviderPriority: true,
        ocrProviderEnabled: true,
        ocrQuotaThresholdPercent: true,
        defaultExportFormat: true,
        defaultPdfTemplate: true,
        enableMultiCurrency: true,
        waLinked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Bisnis tidak ditemukan');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.business.update({
        where: { id: businessId },
        data: {
          ...(dto.baseCurrency !== undefined && { baseCurrency: dto.baseCurrency }),
          ...(dto.realtimeSyncEnabled !== undefined && { realtimeSyncEnabled: dto.realtimeSyncEnabled }),
          ...(dto.ocrProviderPriority !== undefined && { ocrProviderPriority: dto.ocrProviderPriority }),
          ...(dto.ocrProviderEnabled !== undefined && { ocrProviderEnabled: dto.ocrProviderEnabled }),
          ...(dto.ocrQuotaThresholdPercent !== undefined && { ocrQuotaThresholdPercent: dto.ocrQuotaThresholdPercent }),
          ...(dto.defaultExportFormat !== undefined && { defaultExportFormat: dto.defaultExportFormat }),
          ...(dto.defaultPdfTemplate !== undefined && { defaultPdfTemplate: dto.defaultPdfTemplate }),
          ...(dto.enableMultiCurrency !== undefined && { enableMultiCurrency: dto.enableMultiCurrency }),
        },
      });

      // Rekam Audit Log manual karena ini mengubah state Business
      await tx.auditLog.create({
        data: {
          businessId,
          userId,
          entityType: 'BusinessSettings',
          entityId: businessId,
          action: AuditAction.UPDATE,
          beforeState: {
            baseCurrency: existing.baseCurrency,
            realtimeSyncEnabled: existing.realtimeSyncEnabled,
            ocrProviderPriority: existing.ocrProviderPriority,
            ocrProviderEnabled: existing.ocrProviderEnabled,
            ocrQuotaThresholdPercent: existing.ocrQuotaThresholdPercent,
            defaultExportFormat: existing.defaultExportFormat,
            defaultPdfTemplate: existing.defaultPdfTemplate,
            enableMultiCurrency: existing.enableMultiCurrency,
          },
          afterState: {
            baseCurrency: result.baseCurrency,
            realtimeSyncEnabled: result.realtimeSyncEnabled,
            ocrProviderPriority: result.ocrProviderPriority,
            ocrProviderEnabled: result.ocrProviderEnabled,
            ocrQuotaThresholdPercent: result.ocrQuotaThresholdPercent,
            defaultExportFormat: result.defaultExportFormat,
            defaultPdfTemplate: result.defaultPdfTemplate,
            enableMultiCurrency: result.enableMultiCurrency,
          },
        },
      });

      return result;
    });

    return {
      id: updated.id,
      name: updated.name,
      baseCurrency: updated.baseCurrency,
      realtimeSyncEnabled: updated.realtimeSyncEnabled,
      ocrProviderPriority: updated.ocrProviderPriority,
      ocrProviderEnabled: updated.ocrProviderEnabled,
      ocrQuotaThresholdPercent: updated.ocrQuotaThresholdPercent,
      defaultExportFormat: updated.defaultExportFormat,
      defaultPdfTemplate: updated.defaultPdfTemplate,
      enableMultiCurrency: updated.enableMultiCurrency,
      waLinked: updated.waLinked,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── WhatsApp Linking ─────────────────────────────────────────────────────

  /**
   * Step 1: User submit nomor WA.
   * Sistem generate OTP 6-digit, simpan di Redis (10 menit),
   * lalu kirim ke nomor WA tersebut via Meta API.
   */
  async linkWhatsapp(userId: string, businessId: string, dto: LinkWhatsappDto) {
    // Cek apakah nomor sudah dipakai user lain
    const existing = await this.prisma.user.findFirst({
      where: { whatsappPhone: dto.phoneNumber, waVerified: true },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Nomor WA ini sudah digunakan oleh akun lain.');
    }

    // Generate OTP 6-digit
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const attemptsKey = `wa_otp_attempts:${userId}`;
    const otpKey = `wa_otp:${userId}`;

    // Simpan OTP dan nomor sementara di Redis
    await this.redis.set(otpKey, JSON.stringify({ otp, phone: dto.phoneNumber }), OTP_TTL_SECONDS);
    await this.redis.del(attemptsKey); // reset percobaan

    // Simpan nomor WA sementara (belum verified) di DB agar bot bisa identifikasi
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappPhone: dto.phoneNumber,
        waVerified: false,
        waVerificationCode: otp,
      },
    });

    // Kirim OTP via WhatsApp
    const message =
      `🔐 *Kode Verifikasi CatUang*\n\n` +
      `Kode OTP Anda: *${otp}*\n` +
      `Berlaku selama 10 menit.\n\n` +
      `Jangan bagikan kode ini ke siapapun.`;
    await this.waBot.sendReply(dto.phoneNumber, message);

    return {
      message: 'Kode OTP telah dikirim ke WhatsApp Anda. Berlaku 10 menit.',
      phoneNumber: dto.phoneNumber,
    };
  }

  /**
   * Step 2: User submit OTP yang diterima via WA.
   * Validasi OTP, tandai nomor sebagai verified, update waLinked di Business.
   */
  async verifyWhatsapp(userId: string, businessId: string, dto: VerifyWhatsappDto) {
    const otpKey = `wa_otp:${userId}`;
    const attemptsKey = `wa_otp_attempts:${userId}`;

    const raw = await this.redis.get(otpKey);
    if (!raw) {
      throw new BadRequestException('Kode OTP sudah kadaluarsa atau tidak ditemukan. Silakan minta ulang.');
    }

    const { otp, phone } = JSON.parse(raw) as { otp: string; phone: string };

    // Track attempts (brute-force protection) using manual counter
    const currentAttempts = await this.redis.get(attemptsKey);
    const attempts = (currentAttempts ? parseInt(currentAttempts, 10) : 0) + 1;
    await this.redis.set(attemptsKey, String(attempts), OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.del(otpKey);
      throw new BadRequestException('Terlalu banyak percobaan. Silakan minta kode OTP baru.');
    }

    if (dto.code !== otp) {
      const remaining = OTP_MAX_ATTEMPTS - attempts;
      throw new BadRequestException(`Kode OTP salah. Sisa percobaan: ${remaining}`);
    }

    // OTP benar — verifikasi nomor dan cleanup Redis
    await this.redis.del(otpKey);
    await this.redis.del(attemptsKey);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          whatsappPhone: phone,
          waVerified: true,
          waVerifiedAt: new Date(),
          waVerificationCode: null,
        },
      });
      // Tandai bisnis bahwa WA sudah linked
      await tx.business.update({
        where: { id: businessId },
        data: { waLinked: true },
      });
    });

    return { message: 'WhatsApp berhasil dihubungkan! Kamu sekarang bisa catat transaksi via WA.' };
  }

  /**
   * User hapus WA linking — nomor dihapus dari akun.
   * Kalau tidak ada user lain di bisnis yang masih linked, set waLinked = false di Business.
   */
  async unlinkWhatsapp(userId: string, businessId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.waVerified) {
      throw new BadRequestException('Akun ini belum menghubungkan WhatsApp.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappPhone: null,
        waVerified: false,
        waVerifiedAt: null,
        waVerificationCode: null,
      },
    });

    // Cek apakah masih ada user lain di bisnis yang linked
    const stillLinked = await this.prisma.user.count({
      where: { businessId, waVerified: true },
    });
    if (stillLinked === 0) {
      await this.prisma.business.update({
        where: { id: businessId },
        data: { waLinked: false },
      });
    }

    return { message: 'WhatsApp berhasil dilepaskan dari akun ini.' };
  }
}
