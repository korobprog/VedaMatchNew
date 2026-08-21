import Link from "next/link";
import { UnionAdminTabs } from "@/components/union/admin/admin-tabs";
import { formatDate, stageLabels } from "@/lib/admin-labels";
import { getUnionAdminProfiles } from "@/lib/union-api";

export const metadata = {
  title: "Знакомства — анкеты",
  robots: { index: false, follow: false },
};

const VISIBILITY = [
  { value: "all", label: "Все" },
  { value: "active", label: "В выдаче" },
  { value: "hidden", label: "Сняты" },
];

export default async function AdminUnionProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const q = single(raw.q) ?? "";
  const visibility = single(raw.visibility) ?? "all";
  const reportedOnly = single(raw.reportedOnly) === "true";
  const page = Number(single(raw.page)) || 1;

  const list = await getUnionAdminProfiles({
    page,
    ...(q ? { q } : {}),
    ...(visibility === "active" || visibility === "hidden"
      ? { visibility }
      : {}),
    ...(reportedOnly ? { reportedOnly: true } : {}),
  });
  if (!list) throw new Error("Не удалось загрузить анкеты");

  return (
    <>
      <UnionAdminTabs active="profiles" />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-text-1">
          Поиск
          <input
            name="q"
            defaultValue={q}
            placeholder="имя или почта"
            className="mt-1 block w-64 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
        </label>
        <label className="text-sm font-medium text-text-1">
          Видимость
          <select
            name="visibility"
            defaultValue={visibility}
            className="mt-1 block w-40 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          >
            {VISIBILITY.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-text-1">
          <input
            type="checkbox"
            name="reportedOnly"
            value="true"
            defaultChecked={reportedOnly}
          />
          Только с открытыми жалобами
        </label>
        <button
          type="submit"
          className="rounded-xl border border-magenta/50 px-4 py-2 text-sm font-medium text-text-0 hover:bg-magenta/10"
        >
          Применить
        </button>
        <Link
          href="/admin/union/profiles"
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Сбросить
        </Link>
      </form>

      {list.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Анкет по этим условиям нет.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.items.map((item) => (
              <li
                key={item.userId}
                className="glass relative rounded-2xl border border-glass-brd p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  {/* Карточка кликается целиком: на телефоне строка имени
                      высотой в текст — слишком мелкая цель для пальца. */}
                  <Link
                    href={`/admin/union/profiles/${item.userId}`}
                    className="font-medium text-text-0 underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="text-xs text-text-2">{item.email}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {!item.isActive && (
                    <Badge>снята с выдачи</Badge>
                  )}
                  {item.accountBlocked && <Badge>аккаунт закрыт</Badge>}
                  {item.openReports > 0 && (
                    <Badge tone="alert">жалоб: {item.openReports}</Badge>
                  )}
                  {item.spiritualStage && (
                    <Badge>{stageLabels[item.spiritualStage]}</Badge>
                  )}
                  {item.city && <Badge>{item.city}</Badge>}
                  <Badge>фото: {item.photosCount}</Badge>
                </div>

                <p className="mt-2 text-xs text-text-2">
                  Был в сети: {formatDate(item.lastSeenAt)} · анкета изменена:{" "}
                  {formatDate(item.updatedAt)}
                </p>
              </li>
            ))}
          </ul>

          <nav
            className="mt-6 flex items-center justify-between gap-3 text-sm text-text-1"
            aria-label="Страницы списка анкет"
          >
            <span>
              Анкет: {list.total} · страница {list.page} из {list.totalPages}
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
  for (const key of ["q", "visibility", "reportedOnly"]) {
    const value = single(raw[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/union/profiles?${params.toString()}`}
      className="rounded-xl border border-glass-brd px-3 py-1.5 hover:text-text-0"
    >
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
