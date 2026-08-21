import Link from "next/link";
import type { ContactsProfileStatus } from "@vedamatch/shared";
import { ContactsAdminTabs } from "@/components/contacts/admin/admin-tabs";
import { ContactsProfileActions } from "@/components/contacts/admin/profile-actions";
import { formatDate } from "@/lib/admin-labels";
import { getContactsAdminProfiles } from "@/lib/api";

export const metadata = {
  title: "Справочник — карточки",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<ContactsProfileStatus, string> = {
  draft: "Черновик",
  pending: "Снята администрацией",
  active: "В справочнике",
};

const STATUSES = [
  { value: "", label: "Любой" },
  { value: "active", label: "В справочнике" },
  { value: "pending", label: "Снята администрацией" },
  { value: "draft", label: "Черновик" },
];

export default async function AdminContactsProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const q = single(raw.q) ?? "";
  const status = single(raw.status) ?? "";
  const hiddenOnly = single(raw.hiddenOnly) === "true";
  const page = Number(single(raw.page)) || 1;

  const list = await getContactsAdminProfiles({
    page,
    ...(q ? { q } : {}),
    ...(status ? { status: status as ContactsProfileStatus } : {}),
    ...(hiddenOnly ? { hiddenOnly: true } : {}),
  });
  if (!list) throw new Error("Не удалось загрузить карточки");

  return (
    <>
      <ContactsAdminTabs active="profiles" />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-text-1">
          Поиск
          <input
            name="q"
            defaultValue={q}
            placeholder="имя, почта или заголовок"
            className="mt-1 block w-72 max-w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
        </label>
        <label className="text-sm font-medium text-text-1">
          Статус
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block w-56 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
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
            name="hiddenOnly"
            value="true"
            defaultChecked={hiddenOnly}
          />
          Только скрытые самими
        </label>
        <button
          type="submit"
          className="rounded-xl border border-magenta/50 px-4 py-2 text-sm font-medium text-text-0 hover:bg-magenta/10"
        >
          Применить
        </button>
        <Link
          href="/admin/contacts/profiles"
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
        >
          Сбросить
        </Link>
      </form>

      {list.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Карточек по этим условиям нет.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.items.map((profile) => (
              <li
                key={profile.userId}
                className="glass rounded-2xl border border-glass-brd p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/admin/users/${profile.userId}`}
                    className="font-medium text-text-0 underline-offset-2 hover:underline"
                  >
                    {profile.name}
                  </Link>
                  <span className="text-xs text-text-2">{profile.email}</span>
                </div>

                {profile.headline && (
                  <p className="mt-1 text-sm text-text-1">{profile.headline}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{STATUS_LABELS[profile.status]}</Badge>
                  <Badge>видимость: {profile.visibility}</Badge>
                  {profile.openReports > 0 && (
                    <Badge tone="alert">жалоб: {profile.openReports}</Badge>
                  )}
                  {profile.city && <Badge>{profile.city}</Badge>}
                  {profile.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>

                <p className="mt-2 text-xs text-text-2">
                  Обращений получено: {profile.requestsReceived} · был в сети:{" "}
                  {formatDate(profile.lastSeenAt)} · изменена:{" "}
                  {formatDate(profile.updatedAt)}
                </p>

                <ContactsProfileActions
                  userId={profile.userId}
                  status={profile.status}
                />
              </li>
            ))}
          </ul>

          <nav
            className="mt-6 flex items-center justify-between gap-3 text-sm text-text-1"
            aria-label="Страницы списка карточек"
          >
            <span>
              Карточек: {list.total} · страница {list.page} из {list.totalPages}
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
  for (const key of ["q", "status", "hiddenOnly"]) {
    const value = single(raw[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/contacts/profiles?${params.toString()}`}
      className="rounded-xl border border-glass-brd px-3 py-1.5 hover:text-text-0"
    >
      {label}
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
