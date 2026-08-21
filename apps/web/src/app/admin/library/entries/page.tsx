import Link from "next/link";
import type { LibraryEntryStatus } from "@vedamatch/shared";
import { LibraryAdminTabs } from "@/components/library/admin/admin-tabs";
import { LibraryEntryActions } from "@/components/library/admin/entry-actions";
import { formatDate } from "@/lib/admin-labels";
import { getLibraryAdminEntries } from "@/lib/library-api";

export const metadata = {
  title: "Образование — записи",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<LibraryEntryStatus, string> = {
  published: "В каталоге",
  hidden_by_reports: "Скрыта по жалобам",
  removed_by_admin: "Снята администрацией",
};

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "", label: "Любой" },
  { value: "published", label: "В каталоге" },
  { value: "removed_by_admin", label: "Снята администрацией" },
];

export default async function AdminLibraryEntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const q = single(raw.q) ?? "";
  const status = single(raw.status) ?? "";
  const notEnrichedOnly = single(raw.notEnrichedOnly) === "true";
  const page = Number(single(raw.page)) || 1;

  const list = await getLibraryAdminEntries({
    page,
    ...(q ? { q } : {}),
    ...(status ? { status: status as LibraryEntryStatus } : {}),
    ...(notEnrichedOnly ? { notEnrichedOnly: true } : {}),
  });
  if (!list) throw new Error("Не удалось загрузить записи");

  return (
    <>
      <LibraryAdminTabs active="entries" />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-text-1">
          Поиск
          <input
            name="q"
            defaultValue={q}
            placeholder="ссылка, домен или заголовок"
            className="mt-1 block w-72 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
        </label>
        <label className="text-sm font-medium text-text-1">
          Статус
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block w-52 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          >
            {STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-text-1">
          <input
            type="checkbox"
            name="notEnrichedOnly"
            value="true"
            defaultChecked={notEnrichedOnly}
          />
          Только без обогащения
        </label>
        <button
          type="submit"
          className="rounded-xl border border-magenta/50 px-4 py-2 text-sm font-medium text-text-0 hover:bg-magenta/10"
        >
          Применить
        </button>
        <Link
          href="/admin/library/entries"
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Сбросить
        </Link>
      </form>

      {list.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Записей по этим условиям нет.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.items.map((entry) => (
              <li
                key={entry.id}
                className="glass rounded-2xl border border-glass-brd p-4"
              >
                <p className="font-medium text-text-0">
                  {entry.titleRu ?? entry.titleEn ?? entry.domain}
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-text-2">
                  {entry.url}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{STATUS_LABELS[entry.status]}</Badge>
                  <Badge>{entry.type}</Badge>
                  {entry.enrichmentStatus !== "ready" && (
                    <Badge tone="alert">
                      обогащение: {entry.enrichmentStatus}
                    </Badge>
                  )}
                  {entry.categories.map((category) => (
                    <Badge key={category}>{category}</Badge>
                  ))}
                </div>

                {entry.enrichmentError && (
                  <p className="mt-1.5 text-xs text-text-1">
                    Ошибка обогащения: {entry.enrichmentError}
                  </p>
                )}

                <p className="mt-2 text-xs text-text-2">
                  Добавил: {entry.addedByName ?? "—"} ·{" "}
                  {formatDate(entry.createdAt)} · полезно:{" "}
                  {entry.usefulCount} · комментариев: {entry.commentsCount}
                </p>

                <LibraryEntryActions entryId={entry.id} status={entry.status} />
              </li>
            ))}
          </ul>

          <nav
            className="mt-6 flex items-center justify-between gap-3 text-sm text-text-1"
            aria-label="Страницы списка записей"
          >
            <span>
              Записей: {list.total} · страница {list.page} из {list.totalPages}
            </span>
            <span className="flex gap-2">
              {list.page > 1 && (
                <PageLink raw={raw} page={list.page - 1} label="Назад" />
              )}
              {list.page < list.totalPages && (
                <PageLink raw={raw} page={list.page + 1} label="Вперёд" />
              )}
            </span>
          </nav>
        </>
      )}
    </>
  );
}

function Badge({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "alert";
}) {
  return (
    <span
      className={[
        "rounded-full border px-2 py-0.5",
        tone === "alert"
          ? "border-magenta/40 text-text-1"
          : "border-glass-brd text-text-2",
      ].join(" ")}
    >
      {children}
    </span>
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
  for (const key of ["q", "status", "notEnrichedOnly"]) {
    const value = single(raw[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/library/entries?${params.toString()}`}
      className="rounded-xl border border-glass-brd px-3 py-1.5 hover:text-text-0"
    >
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
