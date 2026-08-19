import type { MotivationAdminAiVerdictDto } from '@vedamatch/shared';

/**
 * Чтение записей `MotivationModerationAudit` для админских экранов. Вынесено
 * из сервисов: и очередь, и вкладка рилсов показывают одно и то же — последнее
 * слово ИИ и обращение автора.
 */
export interface AuditRow {
  action: string;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
}

const AI_ACTIONS = new Set([
  'ai_suggest',
  'ai_escalate',
  'ai_approve',
  'ai_reject',
  'ai_error',
  'ai_publish',
]);

/** Последняя запись ИИ-модератора в виде, пригодном для карточки. */
export function adminAiVerdictOf(
  audits: readonly AuditRow[],
): MotivationAdminAiVerdictDto | null {
  const row = audits.find((audit) => AI_ACTIONS.has(audit.action));
  if (!row) return null;
  // Вердикт лежит либо во вложенном `verdict` (одобрение и отказ идут через
  // общий transition), либо прямо в metadata (заметки ИИ).
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const verdict = (meta.verdict ?? meta) as Record<string, unknown>;
  return {
    action: row.action as MotivationAdminAiVerdictDto['action'],
    decision: typeof verdict.decision === 'string' ? verdict.decision : null,
    resolved: typeof verdict.resolved === 'string' ? verdict.resolved : null,
    confidence:
      typeof verdict.confidence === 'number' ? verdict.confidence : null,
    flags: Array.isArray(verdict.flags)
      ? verdict.flags.filter((flag): flag is string => typeof flag === 'string')
      : [],
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Обращение автора после отказа: одно на рилс, поэтому берём первое найденное. */
export function adminAppealOf(
  audits: readonly AuditRow[],
): { message: string; createdAt: string } | null {
  const row = audits.find((audit) => audit.action === 'appeal');
  return row?.reason
    ? { message: row.reason, createdAt: row.createdAt.toISOString() }
    : null;
}
