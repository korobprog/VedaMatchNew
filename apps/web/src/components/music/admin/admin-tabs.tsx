import Link from "next/link";

/**
 * Переключатель разделов админки Музыки.
 *
 * Счётчик очереди стоит прямо на вкладке: модерация аудио — единственное
 * здесь, что горит. Правообладатель приходит быстрее модератора, и «сколько
 * ждёт» должно быть видно до захода внутрь.
 */
export function MusicAdminTabs({
  active,
  pendingCount = 0,
}: {
  active: "queue" | "catalog";
  pendingCount?: number;
}) {
  const tabs = [
    { key: "queue" as const, href: "/admin/music", label: "Очередь" },
    {
      key: "catalog" as const,
      href: "/admin/music/catalog",
      label: "Справочники",
    },
  ];

  return (
    <nav className="my-5 flex gap-2" aria-label="Разделы админки Музыки">
      {tabs.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={`flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
              current
                ? "border-violet/40 bg-violet/15 text-text-0"
                : "border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {tab.label}
            {tab.key === "queue" && pendingCount > 0 && (
              <span className="rounded-full bg-gold/20 px-1.5 font-mono text-[11px] text-gold">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
