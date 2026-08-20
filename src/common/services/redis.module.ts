import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * RedisModule — @Global() supaya RedisService tersedia di seluruh aplikasi
 * tanpa perlu di-import ulang di tiap modul.
 *
 * Daftarkan sekali di AppModule.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
