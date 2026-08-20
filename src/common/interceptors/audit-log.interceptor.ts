import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  AUDIT_LOG_KEY,
  AuditLogMetadata,
} from '../decorators/audit-log.decorator';

interface AuditRequestUser {
  id?: string;
  businessId?: string;
}

interface AuditLogRequest {
  user?: AuditRequestUser;
  params?: Record<string, string>;
}

/**
 * AuditLogInterceptor — mencatat operasi CREATE/UPDATE/DELETE ke tabel AuditLog secara otomatis.
 * Sesuai 01-architecture.md §4.4 dan 03-backend-guide.md.
 *
 * Cara pakai: tambahkan @AuditLog('Account', AuditAction.CREATE) pada method controller.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditLogMetadata>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    // Jika tidak ada decorator @AuditLog, lewati
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditLogRequest>();
    const user = request.user;

    return next.handle().pipe(
      tap((responseData) => {
        void this.writeAuditLog(metadata, user, request, responseData);
      }),
    );
  }

  private async writeAuditLog(
    metadata: AuditLogMetadata,
    user: AuditRequestUser | undefined,
    request: AuditLogRequest,
    responseData: unknown,
  ): Promise<void> {
    try {
      if (!user || !user.businessId) {
        this.logger.warn(`Skipping audit log for ${metadata.entityType}:${metadata.action} due to missing user.businessId`);
        return;
      }

      const afterState =
        responseData && typeof responseData === 'object'
          ? (responseData as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      const rawId = (responseData as Record<string, unknown> | null | undefined)
        ?.id;
      const entityId =
        typeof rawId === 'string' || typeof rawId === 'number'
          ? String(rawId)
          : (request.params?.id ?? 'unknown');

      await this.prisma.auditLog.create({
        data: {
          businessId: user.businessId,
          userId: user.id || null,
          entityType: metadata.entityType,
          entityId: String(entityId),
          action: metadata.action,
          afterState,
        },
      });
    } catch (error) {
      // Audit log failure should NOT break the main operation
      this.logger.error(
        `Failed to create audit log for ${metadata.entityType}:${metadata.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
