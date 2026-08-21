import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from './export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { ExportStatus } from '@prisma/client';

describe('ExportService', () => {
  let service: ExportService;
  let prismaService: PrismaService;
  let exportQueue: any;

  const mockPrismaService = {
    exportJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockExportQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: getQueueToken('export-processing'),
          useValue: mockExportQueue,
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
    prismaService = module.get<PrismaService>(PrismaService);
    exportQueue = module.get(getQueueToken('export-processing'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createExportJob', () => {
    it('harus membuat job di database dan mengirim pesan ke queue', async () => {
      const mockJob = { id: 'job-1', status: ExportStatus.PROCESSING };
      mockPrismaService.exportJob.create.mockResolvedValue(mockJob);
      mockExportQueue.add.mockResolvedValue(true);

      const dto = { reportType: 'PROFIT_LOSS', mode: 'COMBINED', format: 'JSON', from: '2026', to: '2027' };
      const result = await service.createExportJob('b1', 'u1', dto as any);

      expect(result.exportJobId).toBe('job-1');
      expect(prismaService.exportJob.create).toHaveBeenCalled();
      expect(exportQueue.add).toHaveBeenCalledWith(
        'generate-report',
        expect.objectContaining({ jobId: 'job-1', businessId: 'b1' }),
        expect.any(Object),
      );
    });
  });

  describe('getExportJob', () => {
    it('harus mengembalikan detail job jika ada dan dimiliki businessId yang sama', async () => {
      const mockJob = { id: 'job-1', status: ExportStatus.COMPLETED, downloadUrl: 'http://link' };
      mockPrismaService.exportJob.findFirst.mockResolvedValue(mockJob);

      const result = await service.getExportJob('job-1', 'b1');
      expect(result.downloadUrl).toBe('http://link');
    });

    it('harus melempar NotFoundException jika job tidak ditemukan atau cross-tenant', async () => {
      mockPrismaService.exportJob.findFirst.mockResolvedValue(null);
      await expect(service.getExportJob('job-invalid', 'b1')).rejects.toThrow(NotFoundException);
    });
  });
});
