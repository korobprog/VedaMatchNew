import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Левый рельс сервиса — «своя музыка». См. макет `.design/music/Catalog.dc.html`.
 *
 * Разделы, которых ещё нет (Плейлисты и История приезжают этапами 4 и 9),
 * показываются, но не кликаются: место в раскладке они занимают с
 * первого дня, иначе рельс будет перестраиваться под человеком каждый раз.
 * Ссылкой они при этом не притворяются — неактивный пункт помечен `скоро`,
 * не получает фокус и не читается скринридером как ссылка. Приглушённая
 * ссылка, ведущая в 404, хуже честной заглушки.
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
  active: "catalog" | "favorites" | "uploads";
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
  ];

  const row =
    "flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-semibold";

  return (
    <nav aria-label="Своя музыка" className="w-full lg:w-56 lg:shrink-0">
      <ul className="glass flex flex-col gap-0.5 rounded-2xl p-2.5">
        {items.map((item) => {
          const current = item.key === active;
          const badge =
            item.count !== undefined && item.count > 0 ? (
              <span
                className={`ml-auto rounded-full px-1.5 font-mono text-[11px] ${
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
              <li key={item.key}>
                <span aria-disabled="true" className={`${row} text-text-2`}>
                  {item.icon}
                  {item.label}
                  <span className="ml-auto rounded-full border border-glass-brd px-1.5 text-[11px] font-medium">
                    скоро
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={item.key}>
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
