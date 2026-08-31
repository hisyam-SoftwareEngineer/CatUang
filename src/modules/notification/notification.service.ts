import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waBot: WhatsappBotService,
  ) {}

  /**
   * Kirim pengingat pencatatan harian via WA ke semua user yang:
   * - memiliki nomor WA terverifikasi (waVerified = true)
   * - belum mencatat transaksi APAPUN hari ini (berdasarkan occurredAt)
   */
  async sendDailyReminderToInactiveUsers(): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Ambil semua user dengan WA terverifikasi
    const waUsers = await this.prisma.user.findMany({
      where: {
        waVerified: true,
        whatsappPhone: { not: null },
      },
      select: {
        id: true,
        whatsappPhone: true,
        businessId: true,
      },
    });

    this.logger.log(`Checking ${waUsers.length} WA-linked users for daily reminder`);

    for (const user of waUsers) {
      if (!user.whatsappPhone) continue;

      // Cek apakah user sudah ada transaksi hari ini
      const todayTxCount = await this.prisma.transaction.count({
        where: {
          businessId: user.businessId,
          occurredAt: { gte: startOfDay, lte: endOfDay },
          deletedAt: null,
        },
      });

      if (todayTxCount === 0) {
        const message =
          `📒 *Pengingat Pembukuan CatUang*\n\n` +
          `Hei! Kamu belum mencatat transaksi hari ini. 📝\n\n` +
          `Ketik pesan seperti ini untuk mencatat:\n` +
          `• _masuk 500rb dari jual nasi_\n` +
          `• _keluar 200rb beli beras_\n\n` +
          `Ketik *bantuan* untuk daftar perintah lengkap.`;

        try {
          await this.waBot.sendReply(user.whatsappPhone, message);
          this.logger.log(
            `Daily reminder sent to ${user.whatsappPhone} (businessId: ${user.businessId})`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send reminder to ${user.whatsappPhone}: ${(err as Error).message}`,
          );
        }
      }
    }
  }
}
