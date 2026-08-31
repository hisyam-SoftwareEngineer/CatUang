import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Cron job pengingat harian — berjalan setiap hari pukul 20:00 WIB (UTC+7 = 13:00 UTC)
   *
   * Logika: cek semua user dengan WA terverifikasi yang belum mencatat
   * transaksi apapun di bisnis mereka hari ini → kirim pengingat via WA.
   *
   * Best Practice:
   * - Jangan jalankan di NODE_ENV=test agar unit test tidak memicu cron
   * - Gunakan try/catch agar satu failure tidak membatalkan seluruh batch
   */
  @Cron('0 13 * * *', {
    name: 'daily-wa-reminder',
    timeZone: 'UTC',
  })
  async handleDailyReminder(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    this.logger.log('Running daily WA reminder cron job...');
    try {
      await this.notificationService.sendDailyReminderToInactiveUsers();
      this.logger.log('Daily WA reminder cron job completed successfully.');
    } catch (err) {
      this.logger.error('Daily WA reminder cron job failed:', (err as Error).message);
    }
  }
}
