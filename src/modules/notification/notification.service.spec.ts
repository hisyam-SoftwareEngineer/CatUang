import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';

describe('NotificationService', () => {
  let service: NotificationService;

  const mockPrisma = {
    user: { findMany: jest.fn() },
    transaction: { count: jest.fn() },
  };

  const mockWaBot = {
    sendReply: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsappBotService, useValue: mockWaBot },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendDailyReminderToInactiveUsers', () => {
    it('harus mengirim reminder ke user yang belum transaksi hari ini', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', whatsappPhone: '6281234567890', businessId: 'b1' },
      ]);
      // 0 transaksi hari ini
      mockPrisma.transaction.count.mockResolvedValue(0);

      await service.sendDailyReminderToInactiveUsers();

      expect(mockWaBot.sendReply).toHaveBeenCalledWith(
        '6281234567890',
        expect.stringContaining('Pengingat Pembukuan'),
      );
    });

    it('tidak mengirim reminder ke user yang sudah transaksi hari ini', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', whatsappPhone: '6281234567890', businessId: 'b1' },
      ]);
      // Sudah ada 3 transaksi hari ini
      mockPrisma.transaction.count.mockResolvedValue(3);

      await service.sendDailyReminderToInactiveUsers();

      expect(mockWaBot.sendReply).not.toHaveBeenCalled();
    });

    it('harus skip user tanpa whatsappPhone', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', whatsappPhone: null, businessId: 'b1' },
      ]);

      await service.sendDailyReminderToInactiveUsers();

      expect(mockPrisma.transaction.count).not.toHaveBeenCalled();
      expect(mockWaBot.sendReply).not.toHaveBeenCalled();
    });

    it('harus tetap lanjut ke user berikutnya meski satu pengiriman gagal', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', whatsappPhone: '6281111111111', businessId: 'b1' },
        { id: 'u2', whatsappPhone: '6282222222222', businessId: 'b2' },
      ]);
      mockPrisma.transaction.count.mockResolvedValue(0);
      // User pertama gagal kirim
      mockWaBot.sendReply.mockRejectedValueOnce(new Error('WA API error'));
      mockWaBot.sendReply.mockResolvedValueOnce(undefined);

      // Tidak boleh throw exception
      await expect(service.sendDailyReminderToInactiveUsers()).resolves.not.toThrow();

      // User kedua tetap dikirim
      expect(mockWaBot.sendReply).toHaveBeenCalledTimes(2);
      expect(mockWaBot.sendReply).toHaveBeenNthCalledWith(
        2,
        '6282222222222',
        expect.any(String),
      );
    });
  });
});
