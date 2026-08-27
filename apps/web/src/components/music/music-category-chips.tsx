import Link from "next/link";
import type { MusicCategoryDto } from "@vedamatch/shared";

/**
 * Чипы разделов каталога.
 *
 * Ссылки, а не кнопки с состоянием: фильтр обязан быть в адресе. Иначе
 * «пришли послушать бхаджаны» некому переслать, а кнопка «назад» уводит со
 * страницы вместо снятия фильтра. Клиентский JS здесь не нужен вовсе.
 */
export function MusicCategoryChips({
  categories,
  active,
}: {
  categories: MusicCategoryDto[];
  active: string | null;
}) {
  const chip =
    "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors";
  const idle = "border-glass-brd text-text-1 hover:text-text-0";
  const selected = "border-violet/40 bg-violet/15 text-text-0";

  return (
    <nav aria-label="Разделы каталога">
      <ul className="scroll-slim flex gap-2 overflow-x-auto pb-1">
        <li>
          <Link
            href="/music"
            aria-current={active === null ? "page" : undefined}
            className={`${chip} ${active === null ? selected : idle}`}
          >
            Всё
          </Link>
        </li>
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/music?category=${encodeURIComponent(category.slug)}`}
              aria-current={active === category.slug ? "page" : undefined}
              className={`${chip} ${
                active === category.slug ? selected : idle
              }`}
            >
              {category.title}
              {category.trackCount > 0 && (
                <span className="font-mono text-[11px] text-text-2">
                  {category.trackCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
