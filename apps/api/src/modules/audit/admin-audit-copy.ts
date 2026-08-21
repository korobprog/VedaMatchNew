import type { AdminAuditAction, AdminAuditDetails } from '@vedamatch/shared';

/**
 * Строка журнала. Формулировку собирает журнал, а не издатель события: тот
 * сообщает факт («роль изменена, было user, стало admin»), а как это назвать
 * по-русски — забота того, кто показывает.
 */
const TEMPLATES: Record<AdminAuditAction, string> = {
  'user.role-changed': 'Изменена роль',
  'user.services-changed': 'Изменён доступ к сервисам',
  'user.stage-changed': 'Изменён этап',
  'user.blocked': 'Аккаунт заблокирован',
  'user.unblocked': 'Аккаунт разблокирован',
  'user.deleted': 'Аккаунт удалён',
  'user.purged': 'Аккаунт удалён безвозвратно',
  'user.restored': 'Аккаунт восстановлен',
  'user.photo-verified': 'Фото подтверждены',
  'user.photo-unverified': 'Подтверждение фото снято',
  'user.subscription-changed': 'Изменена подписка',
  'billing.mode-changed': 'Изменён режим биллинга',
  'catalog.service-created': 'Добавлен сервис в каталог',
  'catalog.service-updated': 'Изменена карточка сервиса',
  'report.resolved': 'Разобрана жалоба на человека',
  'verification.decided': 'Решение по заявке на проверку',
  'community.decided': 'Решение по заявке сообщества',
  'broadcast.sent': 'Запущена рассылка',
  'broadcast.cancelled': 'Рассылка остановлена',
  'market.report-resolved': 'Разобрана жалоба Рынка',
  'market.listing-hidden': 'Объявление Рынка скрыто',
  'notices.report-resolved': 'Разобрана жалоба на объявление',
  'union.profile-hidden': 'Анкета знакомств снята с выдачи',
  'union.profile-restored': 'Анкета знакомств возвращена в выдачу',
  'union.chat-viewed': 'Просмотрена переписка по жалобе',
  'library.category-merged': 'Слиты категории Образования',
  'library.entry-removed': 'Запись Образования снята с публикации',
  'library.entry-restored': 'Запись Образования возвращена',
  'contacts.tag-created': 'Добавлен тег справочника',
  'contacts.tag-updated': 'Изменён тег справочника',
  'contacts.tag-deleted': 'Удалён тег справочника',
  'contacts.profile-hidden': 'Карточка справочника снята',
  'contacts.profile-restored': 'Карточка справочника возвращена',
  'platform.registration-changed': 'Изменён режим регистрации',
  'astro.generation-resumed': 'Генерация астрологии возобновлена',
};

/** Названия полей подробностей. Неизвестный ключ показывается как есть. */
const DETAIL_LABELS: Record<string, string> = {
  from: 'было',
  to: 'стало',
  reason: 'причина',
  reportId: 'жалоба',
  kind: 'вид',
  messages: 'сообщений',
  status: 'статус',
  title: 'заголовок',
  recipients: 'получателей',
  services: 'сервисы',
  note: 'заметка',
  paidUntil: 'оплачено до',
  until: 'до',
};

export function describeAuditAction(action: AdminAuditAction): string {
  return TEMPLATES[action] ?? action;
}

/**
 * Подробности одной строкой. Пустые значения выбрасываются: «причина: —» в
 * журнале только занимает место.
 */
export function describeAuditDetails(
  details: AdminAuditDetails | null | undefined,
): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}: ${String(value)}`)
    .join(' · ');
}

const KNOWN_ACTIONS = new Set<string>(Object.keys(TEMPLATES));

/**
 * Известное ли это действие. Set, а не `in`: у объекта есть унаследованные
 * ключи вроде `constructor`, и они прошли бы проверку.
 */
export function isKnownAuditAction(value: string): value is AdminAuditAction {
  return KNOWN_ACTIONS.has(value);
}
