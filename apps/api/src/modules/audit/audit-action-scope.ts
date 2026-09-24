import { ADMIN_AUDIT_ACTIONS } from '@vedamatch/shared';
import type { AdminAuditAction, AdminServiceSlug } from '@vedamatch/shared';

/**
 * Сервис, к которому относится действие журнала — для VED-42: `service-admin`
 * должен видеть свои записи и не видеть чужие. Список явный, а не «взять
 * часть строки до точки»: часть действий выглядит как сервисный префикс, но
 * им не является (`catalog.*` — портальный каталог сервисов, доступен только
 * `admin`; `rewards.*` — баллы, портальная механика поперёк сервисов, у неё
 * нет слага в `ADMIN_SERVICE_SLUGS`, см. `rewards/is-admin.ts`), а часть
 * названа по историческому месту, а не по нынешнему модулю (`contacts.*` —
 * права проверяются как `canAdminService(user, 'chat')`, справочник людей
 * переехал в `modules/chat/people`; `union.chat-viewed` — легаси-строка со
 * времён, когда переписка жила в Знакомствах, но сам просмотр — действие
 * переписки, её admin-раздел сегодня `chat`). Угадывать это подстрокой в
 * проде нельзя — компилятор проверяет, что здесь перечислены все действия
 * из `ADMIN_AUDIT_ACTIONS`, а тест — конкретные хитрые случаи.
 */
const ACTION_SERVICE: Record<AdminAuditAction, AdminServiceSlug | null> = {
  'user.role-changed': null,
  'user.services-changed': null,
  'user.stage-changed': null,
  'user.blocked': null,
  'user.unblocked': null,
  'user.deleted': null,
  'user.purged': null,
  'user.restored': null,
  'user.profile-edited': null,
  'user.photo-verified': null,
  'user.photo-unverified': null,
  'user.avatar-removed': null,
  'user.subscription-changed': null,
  'billing.mode-changed': null,
  'catalog.service-created': null,
  'catalog.service-updated': null,
  'report.resolved': null,
  'verification.decided': null,
  'community.decided': null,
  'broadcast.sent': null,
  'broadcast.cancelled': null,
  'market.report-resolved': 'market',
  'market.listing-hidden': 'market',
  'notices.report-resolved': 'notices',
  'notices.notice-deleted': 'notices',
  'union.profile-hidden': 'union',
  'union.profile-restored': 'union',
  'union.showcase-blocked': 'union',
  'union.showcase-unblocked': 'union',
  'union.chat-viewed': 'chat',
  'chat.transcript-viewed': 'chat',
  'library.category-merged': 'library',
  'library.entry-removed': 'library',
  'library.entry-restored': 'library',
  'contacts.tag-created': 'chat',
  'contacts.tag-updated': 'chat',
  'contacts.tag-deleted': 'chat',
  'contacts.profile-hidden': 'chat',
  'contacts.profile-restored': 'chat',
  'platform.registration-changed': null,
  'astro.generation-resumed': 'astro',
  'assistant.settings-changed': 'assistant',
  'assistant.generation-resumed': 'assistant',
  'rewards.entry-revoked': null,
  'rewards.settings-changed': null,
};

/** Слаг сервиса для действия журнала; `null` — портальное, видно только `admin`. */
export function actionServiceSlug(
  action: AdminAuditAction,
): AdminServiceSlug | null {
  return ACTION_SERVICE[action];
}

/**
 * Действия, видимые администратору с таким списком сервисов. Пустой список
 * сервисов даёт пустой список действий — это не ошибка, а «нечего показывать»
 * (у части сервисов, например Музыки, ещё нет записей в журнале).
 */
export function actionsForServices(
  services: readonly string[],
): AdminAuditAction[] {
  if (services.length === 0) return [];
  const allowed = new Set(services);
  return ADMIN_AUDIT_ACTIONS.filter((action) => {
    const slug = ACTION_SERVICE[action];
    return slug !== null && allowed.has(slug);
  });
}
