import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_LOG_KEY = 'audit_log';

export interface AuditLogMetadata {
  entityType: string;
  action: AuditAction;
}

/**
 * Decorator untuk menandai method controller yang harus dicatat ke AuditLog.
 * Sesuai 01-architecture.md §4.4: setiap UPDATE/DELETE dicatat otomatis.
 */
export const AuditLog = (entityType: string, action: AuditAction) =>
  SetMetadata(AUDIT_LOG_KEY, { entityType, action });
