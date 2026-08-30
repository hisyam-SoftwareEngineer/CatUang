import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { WhatsappBotService } from '../whatsapp-bot/whatsapp-bot.service';
import { NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

describe('SettingsService', () => {
  let service: SettingsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    business: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
  };

  const mockWhatsappBotService = {
    sendReply: jest.fn(),
    handleIncomingMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: WhatsappBotService,
          useValue: mockWhatsappBotService,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('harus mengembalikan settings jika bisnis ditemukan', async () => {
      const mockSettings = { id: 'b1', baseCurrency: 'IDR' };
      mockPrismaService.business.findUnique.mockResolvedValue(mockSettings);

      const result = await service.getSettings('b1');
      expect(result).toEqual(mockSettings);
      expect(prismaService.business.findUnique).toHaveBeenCalledWith({
        where: { id: 'b1' },
        select: expect.any(Object),
      });
    });

    it('harus melempar NotFoundException jika bisnis tidak ada', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue(null);
      await expect(service.getSettings('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('harus melakukan update dan mencatat audit log', async () => {
      const existing = { id: 'b1', baseCurrency: 'IDR', enableMultiCurrency: false };
      const updated = { ...existing, enableMultiCurrency: true };
      
      mockPrismaService.business.findUnique.mockResolvedValue(existing);
      mockPrismaService.business.update.mockResolvedValue(updated);
      mockPrismaService.auditLog.create.mockResolvedValue({ id: 'a1' });

      const dto = { enableMultiCurrency: true };
      const result = await service.updateSettings('b1', 'u1', dto);

      expect(result.enableMultiCurrency).toBe(true);
      expect(prismaService.business.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { enableMultiCurrency: true },
      });
      expect(prismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'b1',
            userId: 'u1',
            entityType: 'BusinessSettings',
            action: AuditAction.UPDATE,
          })
        })
      );
    });
  });
});
