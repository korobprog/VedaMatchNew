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
  openReports = 0,
}: {
  active: "ingest" | "queue" | "catalog" | "playlists" | "reports";
  pendingCount?: number;
  openReports?: number;
}) {
  const tabs = [
    // Пополнение первым: за ним сюда заходят ежедневно, а очередь и жалобы
    // разбирают по мере появления.
    { key: "ingest" as const, href: "/admin/music/ingest", label: "Пополнение" },
    { key: "queue" as const, href: "/admin/music", label: "Очередь" },
    {
      key: "reports" as const,
      href: "/admin/music/reports",
      label: "Жалобы",
    },
    {
      key: "catalog" as const,
      href: "/admin/music/catalog",
      label: "Справочники",
    },
    {
      key: "playlists" as const,
      href: "/admin/music/playlists",
      label: "Подборки",
    },
  ];

  return (
    <nav
      // Пять вкладок в один ряд не помещаются на телефоне и уводили всю
      // страницу вбок горизонтальной прокруткой.
      className="my-5 flex flex-wrap gap-2"
      aria-label="Разделы админки Музыки"
    >
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
            {/* Жалобы горят иначе: запись по ним уже скрыта, и счётчик
                показывает не «ждёт прослушивания», а «висит снятым». */}
            {tab.key === "reports" && openReports > 0 && (
              <span className="rounded-full bg-magenta/20 px-1.5 font-mono text-[11px] text-magenta">
                {openReports}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
