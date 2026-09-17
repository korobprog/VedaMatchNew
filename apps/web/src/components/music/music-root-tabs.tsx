import Link from "next/link";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { musicFilterHref, type MusicFilterState } from "./music-filters";

/**
 * Корневые вкладки витрины — «Традиционное»/«Современное» (VED-165).
 *
 * Отдельно от остальных разделов, не в общем ряду: это главный выбор
 * каталога, а не один из фильтров. Прежние пять категорий (киртан, бхаджан,
 * мантра…) уехали в фильтр «Стиль» под заголовком и работают с корневой как
 * пересечение — выбрать можно и то, и другое сразу.
 *
 * Ссылки, а не кнопки с состоянием: тем же приёмом, что у прежних чипов
 * (`MusicCategoryChips`) — фильтр обязан быть в адресе, «назад» обязан его
 * снимать, а сама вкладка обязана работать без JavaScript.
 *
 * Корневые вкладки видны всегда, даже с нулём записей: их всего две, они —
 * стабильная навигация, а не список редакционных тегов, и прятать «Совре-
 * менное» до первой размеченной записи значило бы, что редакция не может
 * даже проверить, как выглядит пустой раздел.
 */
export function MusicRootTabs({
  categories,
  state,
}: {
  categories: MusicCategoryDto[];
  state: MusicFilterState;
}) {
  const roots = categories.filter((category) => category.kind === "root");
  if (roots.length === 0) return null;

  const tab =
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors";
  const idle = "border-glass-brd text-text-1 hover:text-text-0";
  const selected = "border-magenta/40 bg-magenta/15 text-text-0";

  return (
    <nav aria-label="Направление">
      <ul className="scroll-slim flex gap-1.5 overflow-x-auto pb-1">
        <li>
          <Link
            href={musicFilterHref(state, { root: null })}
            aria-current={state.root === null ? "page" : undefined}
            className={`${tab} ${state.root === null ? selected : idle}`}
          >
            Всё
          </Link>
        </li>
        {roots.map((root) => (
          <li key={root.id}>
            <Link
              href={musicFilterHref(state, { root: root.slug })}
              aria-current={state.root === root.slug ? "page" : undefined}
              className={`${tab} ${state.root === root.slug ? selected : idle}`}
            >
              {root.title}
              {root.trackCount > 0 && (
                <span className="font-mono text-[11px] text-text-2">
                  {root.trackCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
