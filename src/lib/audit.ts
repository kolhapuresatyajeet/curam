import { id, nowIso } from '@/lib/utils';
import type { AuditLogEntry } from '@/types/domain';

export function createAuditEntry(input: {
  practiceId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  patientId?: string;
  details?: Record<string, unknown>;
}): AuditLogEntry {
  return {
    id: id('aud'),
    practiceId: input.practiceId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    patientId: input.patientId,
    details: input.details ?? {},
    ipAddress: '127.0.0.1',
    createdAt: nowIso(),
  };
}
