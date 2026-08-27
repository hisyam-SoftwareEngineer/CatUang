import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './common/services/redis.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkHealth() {
    try {
      // Pengecekan Postgres
      await this.prisma.$queryRaw`SELECT 1`;

      // Pengecekan Redis via RedisService (dedicated ioredis client)
      await this.redis.ping();

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
