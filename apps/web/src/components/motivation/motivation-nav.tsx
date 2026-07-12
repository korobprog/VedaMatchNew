import Link from "next/link";

export function MotivationNav({ active }: { active: "feed" | "favorites" | "settings" }) {
  const links = [
    ["feed", "/motivation", "Лента"],
    ["favorites", "/motivation/favorites", "Избранное"],
    ["settings", "/motivation/settings", "Настройки"],
  ] as const;

  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto" aria-label="Разделы мотивации">
      {links.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
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
