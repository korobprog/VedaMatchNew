import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getAdminUserContacts, getProfile } from "@/lib/api";
import { accountStatusLabels, roleLabels } from "@/lib/admin-labels";
import { contactLinks } from "@/components/admin/contact-links";
import { plural } from "@/lib/plural";

export const metadata = {
  title: "Связь с участниками",
  robots: { index: false, follow: false },
};

/**
 * Справочник рабочих контактов: телефон и мессенджеры участников, чтобы
 * администрация могла написать человеку, а не искать его по переписке.
 *
 * Отдельным разделом, а не колонкой в общем списке людей: тот открывают ради
 * модерации помногу раз в день, и телефоны светились бы там без нужды.
 *
 * Здесь ровно то, что человек указал сам в своём профиле. Пусто — значит он
 * ничего не оставил, и это не повод искать его контакт другими путями.
 */
export default async function AdminUserContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  const q = first(raw.q);
  const page = first(raw.page);

  const user = await getProfile();
  if (!user) redirectToLogin("/admin/users/contacts");
  if (user.role !== "admin") redirect("/");

  const data = await getAdminUserContacts({ q, page });
  if (!data) throw new Error("Не удалось загрузить контакты");

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0">
          Связь с участниками
        </h1>
        <p className="mt-1 text-text-1">
          Телефон и мессенджеры, которые участник указал в своём профиле.
          Кнопка открывает переписку сразу.
        </p>
      </div>

      {/* Обычная форма, а не поле с обработчиком: адрес с поиском можно
          переслать, «назад» возвращает прежнюю выборку, и всё это работает
          без JavaScript. */}
      <form method="get" className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Имя, духовное имя или почта"
          aria-label="Поиск участника"
          className="h-10 min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 text-sm text-text-0"
        />
        <button
          type="submit"
          className="btn-mint h-10 shrink-0 rounded-xl px-4 text-sm font-bold"
        >
          Найти
        </button>
        {q && (
          <Link
            href="/admin/users/contacts"
            className="flex h-10 shrink-0 items-center rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
          >
            Сбросить
          </Link>
        )}
      </form>

      <p className="mb-3 text-sm text-text-2">
        Всего {data.total}{" "}
        {plural(data.total, "участник", "участника", "участников")}
        {data.items.length > 0 && (
          <>
            {" · "}
            на этой странице со связью {data.reachable} из {data.items.length}
          </>
        )}
      </p>

      {data.items.length === 0 ? (
        <p className="text-sm text-text-1">
          Никого не нашлось. Попробуйте другое имя или часть почты.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((row) => {
            const links = contactLinks(row.messengers);
            return (
              <li
                key={row.id}
                className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/users/${row.id}`}
                    className="font-semibold text-text-0 hover:underline"
                  >
                    {row.displayName}
                  </Link>
                  {/* Мирское имя рядом — только когда оно другое: в
                      администрации надо понимать, кто именно перед тобой. */}
                  {row.name !== row.displayName && (
                    <span className="ml-1.5 text-sm text-text-2">
                      ({row.name})
                    </span>
                  )}
                  <p className="truncate text-sm text-text-2">
                    {row.email} · {roleLabels[row.role]}
                    {row.accountStatus !== "active" && (
                      <span className="ml-1.5 text-gold">
                        {accountStatusLabels[row.accountStatus]}
                      </span>
                    )}
                  </p>
                </div>

                {links.length === 0 ? (
                  <p className="shrink-0 text-sm text-text-2">
                    Связи не оставил
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {links.map((link) =>
                      link.href ? (
                        <li key={link.kind}>
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-9 items-center rounded-xl border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0"
                          >
                            {link.label}
                          </a>
                        </li>
                      ) : (
                        // У MAX надёжной ссылки нет — показываем сам номер,
                        // его копируют.
                        <li
                          key={link.kind}
                          className="flex h-9 items-center rounded-xl border border-dashed border-glass-brd px-3 text-sm text-text-2"
                        >
                          {link.label}: {link.value}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.totalPages > 1 && (
        <nav
          aria-label="Страницы"
          className="mt-5 flex items-center justify-between gap-3"
        >
          <PageLink q={q} page={data.page - 1} disabled={data.page <= 1}>
            Назад
          </PageLink>
          <span className="text-sm text-text-2">
            {data.page} из {data.totalPages}
          </span>
          <PageLink
            q={q}
            page={data.page + 1}
            disabled={data.page >= data.totalPages}
          >
            Дальше
          </PageLink>
        </nav>
      )}
    </>
  );
}

function PageLink({
  q,
  page,
  disabled,
  children,
}: {
  q?: string;
  page: number;
  disabled: boolean;
  children: string;
}) {
  const className =
    "flex h-10 items-center rounded-xl border border-glass-brd px-4 text-sm font-semibold";
  if (disabled) {
    // Не ссылка, а текст: ссылка в никуда обещает страницу, которой нет.
    return (
      <span aria-disabled="true" className={`${className} text-text-2`}>
        {children}
      </span>
    );
  }

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin/users/contacts?${params.toString()}`}
      className={`${className} text-text-1 hover:text-text-0`}
    >
      {children}
    </Link>
  );
}
