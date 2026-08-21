import Link from "next/link";
import { redirect } from "next/navigation";
import { ADMIN_AUDIT_ACTIONS } from "@vedamatch/shared";
import type { AdminAuditAction, AdminAuditQuery } from "@vedamatch/shared";
import { formatDate } from "@/lib/admin-labels";
import { getAdminAudit } from "@/lib/api";
import {
  auditActionLabels,
  auditTargetHref,
  describeAuditDetails,
} from "@/lib/audit-labels";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Журнал действий",
  robots: { index: false, follow: false },
};

/** Готовые периоды: точная дата в журнале нужна реже, чем «за последнюю неделю». */
const PERIODS = [
  { value: "", label: "За всё время" },
  { value: "1", label: "За сутки" },
  { value: "7", label: "За неделю" },
  { value: "30", label: "За месяц" },
];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");

  const raw = await searchParams;
  const action = single(raw.action);
  const days = single(raw.days);
  const targetId = single(raw.targetId);
  const page = Number(single(raw.page)) || 1;

  const query: AdminAuditQuery = {
    page,
    ...(isKnownAction(action) ? { action } : {}),
    ...(targetId ? { targetId } : {}),
    ...(days ? { since: sinceFor(days) } : {}),
  };
  const log = await getAdminAudit(query);
  if (!log) throw new Error("Не удалось загрузить журнал");

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Журнал действий
      </h1>
      <p className="mb-6 mt-1 text-sm text-text-1">
        Что администрация делала с чужими данными и настройками платформы.
        Модерация Motivation ведёт свой журнал — он привязан к посту и виден в
        карточке.
      </p>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-text-1">
          Действие
          <select
            name="action"
            defaultValue={action ?? ""}
            className="mt-1 block w-64 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          >
            <option value="">Любое</option>
            {ADMIN_AUDIT_ACTIONS.map((item) => (
              <option key={item} value={item}>
                {auditActionLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-text-1">
          Период
          <select
            name="days"
            defaultValue={days ?? ""}
            className="mt-1 block w-44 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-text-1">
          ID объекта
          <input
            name="targetId"
            defaultValue={targetId ?? ""}
            placeholder="id пользователя или рассылки"
            className="mt-1 block w-64 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 font-mono text-sm text-text-0 placeholder:text-text-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl border border-magenta/50 px-4 py-2 text-sm font-medium text-text-0 hover:bg-magenta/10"
        >
          Применить
        </button>
        <Link
          href="/admin/audit"
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Сбросить
        </Link>
      </form>

      {log.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Записей нет. Журнал ведётся с момента его появления — более ранние
          действия в нём не восстановить.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {log.items.map((entry) => {
              const href = auditTargetHref(entry.targetType, entry.targetId);
              const details = describeAuditDetails(entry.details);
              return (
                <li
                  key={entry.id}
                  className="glass rounded-2xl border border-glass-brd p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-text-0">
                      {auditActionLabels[entry.action] ?? entry.action}
                    </span>
                    <span className="text-xs text-text-2">
                      {formatDate(entry.createdAt)}
                      {entry.actorName ? ` · ${entry.actorName}` : " · —"}
                    </span>
                  </div>
                  {details && (
                    <p className="mt-1 text-sm text-text-1">{details}</p>
                  )}
                  {entry.targetId && (
                    <p className="mt-1 font-mono text-xs text-text-2">
                      {href ? (
                        <Link href={href} className="hover:text-text-0">
                          {entry.targetType}: {entry.targetId}
                        </Link>
                      ) : (
                        `${entry.targetType}: ${entry.targetId}`
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <nav
            className="mt-6 flex items-center justify-between gap-3 text-sm text-text-1"
            aria-label="Страницы журнала"
          >
            <span>
              Записей: {log.total} · страница {log.page} из {log.totalPages}
            </span>
            <span className="flex gap-2">
              {log.page > 1 && (
                <PageLink raw={raw} page={log.page - 1} label="Назад" />
              )}
              {log.page < log.totalPages && (
                <PageLink raw={raw} page={log.page + 1} label="Вперёд" />
              )}
            </span>
          </nav>
        </>
      )}
    </>
  );
}

function PageLink({
  raw,
  page,
  label,
}: {
  raw: Record<string, string | string[] | undefined>;
  page: number;
  label: string;
}) {
  const params = new URLSearchParams();
  for (const key of ["action", "days", "targetId"]) {
    const value = single(raw[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/audit?${params.toString()}`}
      className="rounded-xl border border-glass-brd px-3 py-1.5 hover:text-text-0"
    >
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isKnownAction(value: string | undefined): value is AdminAuditAction {
  return (
    value !== undefined &&
    (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}

/** Период фильтра в ISO: страница спрашивает днями, API — датой. */
function sinceFor(days: string): string {
  const parsed = Number(days);
  return new Date(Date.now() - parsed * 24 * 60 * 60 * 1000).toISOString();
}
