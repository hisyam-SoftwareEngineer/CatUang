import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RedisService } from '../../../common/services/redis.service';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 10;

interface AuthRequest {
  user: { id: string; businessId: string; role: Role };
}

/**
 * UploadRateLimiterGuard — sliding-window rate limiter untuk endpoint upload.
 *
 * Redis key: `rate:upload:{businessId}`
 * Window: 60 detik, maksimum 10 request per businessId.
 *
 * Fail-open: jika Redis tidak tersedia, request dilanjutkan tanpa error.
 */
@Injectable()
export class UploadRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(UploadRateLimiterGuard.name);

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const businessId = request.user?.businessId;

    if (!businessId) {
      // Tidak ada businessId — fail-open, biarkan guard auth lain menangani
      return true;
    }

    const key = `rate:upload:${businessId}`;

    try {
      const count = await this.redisService.incr(key, RATE_LIMIT_WINDOW_SECONDS);

      if (count > RATE_LIMIT_MAX_REQUESTS) {
        throw new HttpException(
          `Terlalu banyak upload. Maksimum ${RATE_LIMIT_MAX_REQUESTS} upload per ${RATE_LIMIT_WINDOW_SECONDS} detik.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      // Re-throw jika ini adalah 429 dari kita sendiri
      if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw err;
      }

      // Redis tidak tersedia — fail-open, lanjutkan request
      this.logger.warn(
        `Redis tidak tersedia untuk rate limiter (key: ${key}). Fail-open: request dilanjutkan. Error: ${(err as Error).message}`,
      );
      return true;
    }
  }
}
