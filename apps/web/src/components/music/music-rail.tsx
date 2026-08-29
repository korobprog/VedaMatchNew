import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Левый рельс сервиса — «своя музыка». См. макет `.design/music/Catalog.dc.html`.
 *
 * Все шесть пунктов теперь ведут на живые страницы. Механика заглушки
 * (пункт без `href` показывается словом «скоро», а не приглушённой ссылкой в
 * 404) оставлена намеренно: следующий раздел появится тем же способом.
 *
 * Затемнения у неактивных пунктов нет намеренно: `opacity` поверх
 * `--vm-text-2` давала 2.3:1 вместо нормы 4.5:1 — замерено в обеих темах.
 * Состояние несёт слово, а не яркость (WCAG 1.4.1: не только цветом).
 */
interface RailItem {
  key: string;
  label: string;
  href?: string;
  count?: number;
  /** Счётчик, который стоит заметить: жёлтый, как у ждущего разбора. */
  accentCount?: boolean;
  icon: ReactNode;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[17px] w-[17px] shrink-0",
  "aria-hidden": true,
};

export function MusicRail({
  active,
  uploadsCount = 0,
  favoritesCount = 0,
  playlistsCount = 0,
}: {
  active:
    | "catalog"
    | "favorites"
    | "playlists"
    | "history"
    | "uploads"
    | "settings";
  uploadsCount?: number;
  favoritesCount?: number;
  playlistsCount?: number;
}) {
  const items: RailItem[] = [
    {
      key: "catalog",
      label: "Каталог",
      href: "/music",
      icon: (
        <svg {...iconProps} className={`${iconProps.className} text-violet`}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ),
    },
    {
      key: "favorites",
      label: "Избранное",
      href: "/music/favorites",
      count: favoritesCount,
      icon: (
        <svg {...iconProps} className={`${iconProps.className} text-magenta`}>
          <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
        </svg>
      ),
    },
    {
      key: "playlists",
      label: "Плейлисты",
      href: "/music/playlists",
      count: playlistsCount,
      icon: (
        <svg {...iconProps}>
          <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
        </svg>
      ),
    },
    {
      key: "history",
      label: "История",
      href: "/music/history",
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
    },
    {
      key: "uploads",
      label: "Мои загрузки",
      href: "/music/uploads",
      count: uploadsCount,
      accentCount: true,
      icon: (
        <svg {...iconProps}>
          <path d="M12 16V4" />
          <path d="M8 8l4-4 4 4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      ),
    },
    {
      key: "settings",
      label: "Настройки",
      href: "/music/settings",
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
  ];

  // На телефоне рельс — горизонтальная лента, а не столбик. Столбиком он
  // вставал шестью строками НАД каталогом: человек открывал Музыку и видел
  // меню вместо музыки. Лентой он занимает одну строку и прокручивается
  // пальцем. Высота 44px — минимальная цель на телефоне; на широком экране,
  // где целятся курсором, остаются прежние 40.
  const row =
    "flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold lg:h-10 lg:px-2.5";

  return (
    <nav aria-label="Своя музыка" className="w-full lg:w-56 lg:shrink-0">
      <ul className="glass scroll-slim flex gap-1.5 overflow-x-auto rounded-2xl p-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-2.5">
        {items.map((item) => {
          const current = item.key === active;
          const badge =
            item.count !== undefined && item.count > 0 ? (
              <span
                className={`ml-1 rounded-full px-1.5 font-mono text-[11px] lg:ml-auto ${
                  item.accentCount
                    ? "bg-gold/20 text-gold"
                    : "text-text-2"
                }`}
              >
                {item.count}
              </span>
            ) : null;

          if (!item.href) {
            return (
              <li key={item.key} className="shrink-0">
                <span aria-disabled="true" className={`${row} text-text-2`}>
                  {item.icon}
                  {item.label}
                  <span className="ml-1 rounded-full border border-glass-brd px-1.5 text-[11px] font-medium lg:ml-auto">
                    скоро
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`${row} transition-colors ${
                  current
                    ? "bg-violet/12 text-text-0"
                    : "text-text-1 hover:text-text-0"
                }`}
              >
                {item.icon}
                {item.label}
                {badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
