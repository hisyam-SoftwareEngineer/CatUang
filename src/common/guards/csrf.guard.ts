import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const csrfHeader = request.headers['x-csrf-token'];
    const csrfCookie =
      (request.cookies as Record<string, string> | undefined)?.['csrf-token'] ??
      null;

    if (
      typeof csrfHeader !== 'string' ||
      !csrfCookie ||
      csrfHeader !== csrfCookie
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'CSRF_TOKEN_MISMATCH',
        message: 'Token CSRF tidak valid atau tidak ditemukan',
        timestamp: new Date().toISOString(),
      });
    }

    return true;
  }
}
