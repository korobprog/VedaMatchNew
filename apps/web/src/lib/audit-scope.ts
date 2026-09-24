import { ADMIN_AUDIT_ACTIONS } from "@vedamatch/shared";
import type { AdminAuditAction, AdminServiceSlug } from "@vedamatch/shared";

/**
 * Зеркало `audit-action-scope.ts` на бэкенде — список требуется здесь только
 * для того, чтобы не рисовать в выпадающем фильтре действия, которые бэкенд
 * админу сервиса всё равно не отдаст (VED-42). Сам доступ к записям решает
 * сервер, эта копия ничего не защищает и не обязана быть охранной границей.
 */
const ACTION_SERVICE: Record<AdminAuditAction, AdminServiceSlug | null> = {
  "user.role-changed": null,
  "user.services-changed": null,
  "user.stage-changed": null,
  "user.blocked": null,
  "user.unblocked": null,
  "user.deleted": null,
  "user.purged": null,
  "user.restored": null,
  "user.profile-edited": null,
  "user.photo-verified": null,
  "user.photo-unverified": null,
  "user.avatar-removed": null,
  "user.subscription-changed": null,
  "billing.mode-changed": null,
  "catalog.service-created": null,
  "catalog.service-updated": null,
  "report.resolved": null,
  "verification.decided": null,
  "community.decided": null,
  "broadcast.sent": null,
  "broadcast.cancelled": null,
  "market.report-resolved": "market",
  "market.listing-hidden": "market",
  "notices.report-resolved": "notices",
  "notices.notice-deleted": "notices",
  "union.profile-hidden": "union",
  "union.profile-restored": "union",
  "union.showcase-blocked": "union",
  "union.showcase-unblocked": "union",
  "union.chat-viewed": "chat",
  "chat.transcript-viewed": "chat",
  "library.category-merged": "library",
  "library.entry-removed": "library",
  "library.entry-restored": "library",
  "contacts.tag-created": "chat",
  "contacts.tag-updated": "chat",
  "contacts.tag-deleted": "chat",
  "contacts.profile-hidden": "chat",
  "contacts.profile-restored": "chat",
  "platform.registration-changed": null,
  "astro.generation-resumed": "astro",
  "assistant.settings-changed": "assistant",
  "assistant.generation-resumed": "assistant",
  "rewards.entry-revoked": null,
  "rewards.settings-changed": null,
};

/**
 * Действия, которые стоит предлагать в фильтре странице журнала. `null` —
 * ограничения нет (роль `admin`, весь список), пустой массив — сервисов у
 * админа нет вовсе (страница и так его на этот момент не пускает).
 */
export function actionsForServices(
  services: readonly string[] | null,
): readonly AdminAuditAction[] {
  if (services === null) return ADMIN_AUDIT_ACTIONS;
  if (services.length === 0) return [];
  const allowed = new Set(services);
  return ADMIN_AUDIT_ACTIONS.filter((action) => {
    const slug = ACTION_SERVICE[action];
    return slug !== null && allowed.has(slug);
  });
}
