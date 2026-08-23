import type {
  AdminAuditAction,
  AdminAuditDetails,
  AdminAuditTargetType,
} from "@vedamatch/shared";

/**
 * Формулировки журнала. Зеркало admin-audit-copy.ts на бэкенде: API отдаёт
 * действие кодом, а не фразой, чтобы фильтр по действию работал на значении,
 * а не на тексте.
 */
export const auditActionLabels: Record<AdminAuditAction, string> = {
  "user.role-changed": "Изменена роль",
  "user.services-changed": "Изменён доступ к сервисам",
  "user.stage-changed": "Изменён этап",
  "user.blocked": "Аккаунт заблокирован",
  "user.unblocked": "Аккаунт разблокирован",
  "user.deleted": "Аккаунт удалён",
  "user.purged": "Аккаунт удалён безвозвратно",
  "user.restored": "Аккаунт восстановлен",
  "user.photo-verified": "Фото подтверждены",
  "user.photo-unverified": "Подтверждение фото снято",
  "user.subscription-changed": "Изменена подписка",
  "billing.mode-changed": "Изменён режим биллинга",
  "catalog.service-created": "Добавлен сервис в каталог",
  "catalog.service-updated": "Изменена карточка сервиса",
  "report.resolved": "Разобрана жалоба на человека",
  "verification.decided": "Решение по заявке на проверку",
  "community.decided": "Решение по заявке сообщества",
  "broadcast.sent": "Запущена рассылка",
  "broadcast.cancelled": "Рассылка остановлена",
  "market.report-resolved": "Разобрана жалоба Рынка",
  "market.listing-hidden": "Объявление Рынка скрыто",
  "notices.report-resolved": "Разобрана жалоба на объявление",
  "union.profile-hidden": "Анкета знакомств снята с выдачи",
  "union.profile-restored": "Анкета знакомств возвращена в выдачу",
  "union.chat-viewed": "Просмотрена переписка по жалобе",
  "library.category-merged": "Слиты категории Образования",
  "library.entry-removed": "Запись Образования снята с публикации",
  "library.entry-restored": "Запись Образования возвращена",
  "contacts.tag-created": "Добавлен тег справочника",
  "contacts.tag-updated": "Изменён тег справочника",
  "contacts.tag-deleted": "Удалён тег справочника",
  "contacts.profile-hidden": "Карточка справочника снята",
  "contacts.profile-restored": "Карточка справочника возвращена",
  "platform.registration-changed": "Изменён режим регистрации",
  "astro.generation-resumed": "Генерация астрологии возобновлена",
  "rewards.entry-revoked": "Отменено начисление баллов",
  "rewards.settings-changed": "Изменены настройки баллов",
};

const DETAIL_LABELS: Record<string, string> = {
  from: "было",
  to: "стало",
  reason: "причина",
  reportId: "жалоба",
  kind: "вид",
  messages: "сообщений",
  status: "статус",
  title: "заголовок",
  recipients: "получателей",
  services: "сервисы",
  note: "заметка",
  paidUntil: "оплачено до",
  until: "до",
  email: "почта",
  target: "объект",
  hidden: "скрыт",
  verified: "проверено",
  important: "важное",
};

/** Подробности одной строкой; пустые значения выбрасываются. */
export function describeAuditDetails(details: AdminAuditDetails): string {
  return Object.entries(details)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== null && entry[1] !== "",
    )
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}: ${formatValue(value)}`)
    .join(" · ");
}

/** ISO-метка времени: подробности приходят из базы, а читает их человек. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string" && ISO_TIMESTAMP.test(value)) {
    return new Date(value).toLocaleString("ru-RU");
  }
  return String(value);
}

/**
 * Ссылка на объект действия. Есть только там, где в админке действительно
 * есть куда вести: карточка пользователя и раздел рассылок.
 */
export function auditTargetHref(
  targetType: AdminAuditTargetType,
  targetId: string | null,
): string | null {
  if (!targetId) return null;
  if (targetType === "user") return `/admin/users/${targetId}`;
  if (targetType === "broadcast") return "/admin/notifications";
  return null;
}
