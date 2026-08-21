// Журнал действий администрации. Событие самодостаточно: подписчик не
// дочитывает недостающее из чужих таблиц, а формулировку собирает сам — см.
// docs/service-module-contract.md.

/**
 * Что сделала администрация. Список — значение, а не только тип: админка
 * строит по нему фильтр, и держать второй такой же массив в вебе значило бы
 * ловить расхождение глазами.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'user.role-changed',
  'user.services-changed',
  'user.stage-changed',
  'user.blocked',
  'user.unblocked',
  'user.deleted',
  'user.purged',
  'user.restored',
  'user.photo-verified',
  'user.photo-unverified',
  'user.subscription-changed',
  'billing.mode-changed',
  'catalog.service-created',
  'catalog.service-updated',
  'report.resolved',
  'verification.decided',
  'community.decided',
  'broadcast.sent',
  'broadcast.cancelled',
  'market.report-resolved',
  'market.listing-hidden',
  'notices.report-resolved',
  'union.profile-hidden',
  'union.profile-restored',
  'union.chat-viewed',
  'library.category-merged',
  'library.entry-removed',
  'library.entry-restored',
  'contacts.tag-created',
  'contacts.tag-updated',
  'contacts.tag-deleted',
  'contacts.profile-hidden',
  'contacts.profile-restored',
  'astro.generation-resumed',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/** Над чем действие. `platform` — над порталом целиком, без конкретного id. */
export type AdminAuditTargetType =
  | 'user'
  | 'report'
  | 'community'
  | 'listing'
  | 'notice'
  | 'broadcast'
  | 'platform';

/** Подробности строки журнала: было/стало, причина. Только плоские значения. */
export type AdminAuditDetails = Record<string, string | number | boolean | null>;

/**
 * Событие для журнала. Имя — строковый литерал, а не импортируемая константа:
 * пакет отдаёт API только типы, значение отсюда заставило бы Node грузить
 * сырой TypeScript (та же причина, что у NotificationEvent).
 */
export interface AdminAuditEvent {
  actorId: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  details?: AdminAuditDetails;
}

export interface AdminAuditEntryDto {
  id: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string | null;
  details: AdminAuditDetails;
  /** Мирское имя администратора: журнал — админский экран. */
  actorName: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface AdminAuditListResponse {
  items: AdminAuditEntryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminAuditQuery {
  action?: AdminAuditAction;
  actorId?: string;
  targetId?: string;
  /** ISO-дата: записи не старше неё. */
  since?: string;
  page?: number;
  pageSize?: number;
}
