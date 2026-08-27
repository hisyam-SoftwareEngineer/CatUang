import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService — wrapper tipis ioredis untuk key-value cache.
 * Dipakai oleh TransactionService untuk idempotency key (Section 4a backend-guide).
 *
 * Terpisah dari koneksi BullMQ — BullMQ internal dan tidak bisa dipakai langsung
 * untuk operasi get/set umum.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    const isTls = redisUrl.startsWith('rediss://');

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      // Upstash (dan provider Redis managed lain) mewajibkan TLS.
      // Kalau URL pakai rediss://, aktifkan TLS secara eksplisit.
      tls: isTls ? { rejectUnauthorized: false } : undefined,
    });

    this.client.on('error', (err: Error) => {
      // Log tapi jangan crash — sesuai fail-open principle untuk shared infra
      this.logger.error('Redis connection error', err.message);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  /**
   * Ping Redis — dipakai untuk health check.
   */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Ambil nilai dari Redis. Return null kalau key tidak ada.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Simpan nilai ke Redis.
   * @param key - Redis key
   * @param value - nilai string (JSON.stringify jika objek)
   * @param ttlSeconds - Time-to-live dalam detik (opsional)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Hapus key dari Redis.
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Cek apakah key ada.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Increment counter atomically. Set TTL hanya pada call pertama (saat counter = 1).
   * Dipakai untuk sliding window rate limiter.
   *
   * @param key - Redis key
   * @param ttlSeconds - TTL dalam detik yang di-set saat key baru dibuat
   * @returns Nilai counter setelah increment
   */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) {
      // Key baru dibuat — set TTL agar window otomatis reset
      await this.client.expire(key, ttlSeconds);
    }
    return value;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }
}
