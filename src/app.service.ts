import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('ocr-processing') private readonly ocrQueue: Queue,
  ) {}

  async checkHealth() {
    try {
      // Pengecekan Postgres
      await this.prisma.$queryRaw`SELECT 1`;

      // Pengecekan Redis via koneksi BullMQ client
      const redisClient = (await this.ocrQueue.client) as unknown as Redis;
      await redisClient.ping();

      return {
        status: 'ok',
        database: 'connected',
        redis: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new InternalServerErrorException({
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
