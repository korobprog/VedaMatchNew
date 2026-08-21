import Link from "next/link";

export type MotivationSection =
  | "feed"
  | "favorites"
  | "studio"
  | "settings"
  | "admin";

export function MotivationNav({
  active,
  isAdmin,
  compact = false,
}: {
  active: MotivationSection;
  isAdmin?: boolean;
  /** Узкая строка для свёрнутой шапки: без нижнего отступа и мельче. */
  compact?: boolean;
}) {
  const links = [
    ["feed", "/motivation", "Лента"],
    ["favorites", "/motivation/favorites", "Избранное"],
    // «Студия» — место, где живут свои рилсы: там их создают, там же ждут
    // готовый кадр и оживляют его в видео. Раньше раздел назывался «Мои
    // рилсы» и в меню его не было вовсе — попасть можно было только по
    // ссылке из мастера.
    ["studio", "/motivation/my", "Студия"],
    ["settings", "/motivation/settings", "Настройки"],
    ...(isAdmin ? ([["admin", "/admin/motivation", "Админ"]] as const) : []),
  ] as const;

  return (
    // Перенос по строкам, а не горизонтальная прокрутка: на телефоне последний
    // раздел иначе прячется за краем, и о нём надо догадаться.
    <nav className={`flex flex-wrap gap-2 ${compact ? "" : "mb-6"}`} aria-label="Разделы мотивации">
      {links.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`rounded-full font-medium transition ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${
            active === key
              ? "bg-amber-600 text-white"
              : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
