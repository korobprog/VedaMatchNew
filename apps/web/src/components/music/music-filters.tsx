import Link from "next/link";
import type { MusicArtistDto, MusicCategoryDto } from "@vedamatch/shared";
import { styleFilterCategories } from "./music-root-scope";

/**
 * Фильтры каталога — тот самый чип «Фильтры» из макета `Catalog.dc.html`.
 *
 * Всё живёт в адресе, а не в состоянии компонента: страницу с длинными
 * киртанами Аударьи Дхамы должно быть можно переслать, «назад» обязан снимать
 * последний фильтр, а не уводить с сервиса. По той же причине это ссылки, а
 * не форма с кнопкой: выбор применяется сразу и работает без JavaScript.
 *
 * Раскрывается `<details>`, а не переключателем на состоянии: свёрнутый вид —
 * это ровно то, что нужно большинству, а тащить ради стрелочки клиентский
 * компонент в серверную страницу незачем.
 *
 * Рядов в панели ровно два — «Стиль» и «Исполнитель» (VED-165, ответ
 * заказчика: «остальные оставь только фильтр по исполнителю и по стилю»).
 * Прежние «Порядок» (вместе с «По длительности») и «Запись» (с программы /
 * студийная) убраны целиком: выбор витрины — корневая вкладка, стиль и
 * исполнитель, остальное только загромождало панель. Сортировку выдачи
 * сервер берёт свою, `MUSIC_DEFAULT_TRACK_SORT` — по алфавиту.
 */

export interface MusicFilterState {
  /**
   * Корневая категория витрины — «Традиционное»/«Современное» (VED-165).
   * Живёт отдельно от `category` и не считается «Фильтром»: это главный
   * выбор витрины, вкладки над каталогом, а не пункт свёрнутой панели.
   */
  root: string | null;
  /** Стиль — прежний плоский список (киртан, бхаджан, мантра…). */
  category: string | null;
  q: string | null;
  artist: string | null;
  /** Страница выдачи. В счёт фильтров не идёт: это не выбор человека. */
  cursor: string | null;
}

/**
 * Адрес каталога с изменённым одним параметром. Пустые в него не попадают:
 * `?category=&artist=` в ссылке чипа выглядит как поломка.
 *
 * Курсор сбрасывается всегда, кроме случая, когда его же и меняют: смена
 * фильтра обязана начинать выдачу сначала — иначе человек снимает фильтр и
 * попадает на третью страницу другого списка.
 */
export function musicFilterHref(
  state: MusicFilterState,
  patch: Partial<MusicFilterState>,
): string {
  const next = { ...state, cursor: null, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/music?${query}` : "/music";
}

/**
 * Сколько фильтров стоит — числом на свёрнутом чипе. `root` сюда не входит:
 * это главный выбор витрины (вкладки сверху), а не пункт панели фильтров.
 */
export function countMusicFilters(state: MusicFilterState): number {
  return [state.category, state.artist].filter(Boolean).length;
}

const chip =
  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors";
const chipOff = "border-glass-brd text-text-1 hover:text-text-0";
const chipOn = "border-violet/40 bg-violet/15 text-text-0";

export function MusicFilters({
  state,
  artists,
  categories,
}: {
  state: MusicFilterState;
  artists: MusicArtistDto[];
  /** Полный список категорий каталога — стилевые (`kind: 'style'`) отбираются здесь. */
  categories: MusicCategoryDto[];
}) {
  const active = countMusicFilters(state);
  // Раздел «Стиль» виден всегда, даже без единой размеченной записи
  // (тестировщик прямо просил не прятать его): это карта раздела каталога, а
  // не список тегов «что уже нашлось» — редакция должна видеть весь набор
  // стилей, чтобы понимать, что вообще можно проставить, и уметь снять
  // фильтр, даже если он ссылается на пока пустой стиль.
  //
  // Корневые «Традиционное» и «Современное» сюда не попадают — ни настоящие,
  // ни их тёзки из ручной разметки: они выбираются вкладками над каталогом,
  // см. `styleFilterCategories` (VED-165).
  const styles = styleFilterCategories(categories);

  return (
    // `w-fit` и `open:w-full` — чтобы свёрнутый чип стоял в одном ряду с
    // соседней кнопкой («Аудиокниги», VED-237), а раскрытая панель занимала
    // всю ширину, а не жалась в колонку под чипом.
    <details className="group w-fit open:w-full" open={active > 0}>
      <summary className="flex h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border border-glass-brd px-3 text-xs font-medium text-text-1 hover:text-text-0">
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Фильтры
        {active > 0 && (
          <span className="font-mono text-[11px] text-violet">{active}</span>
        )}
      </summary>

      <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-glass-brd bg-white/2 p-3">
        <FilterRow label="Стиль">
          {styles.length === 0 ? (
            <span className="text-xs text-text-2">
              Пока нет ни одного стиля.
            </span>
          ) : (
            styles.map((category) => {
              const on = state.category === category.slug;
              // Пустой стиль не прячется, но приглушён — редакция видит,
              // что раздел существует, но пока ничего в нём не размечено.
              const empty = category.trackCount === 0 && !on;
              return (
                <Link
                  key={category.id}
                  href={musicFilterHref(state, {
                    category: on ? null : category.slug,
                  })}
                  className={`${chip} ${on ? chipOn : chipOff} ${empty ? "opacity-50" : ""}`}
                >
                  {category.title}
                  <span className="ml-1 font-mono text-[11px] text-text-2">
                    {category.trackCount}
                  </span>
                </Link>
              );
            })
          )}
        </FilterRow>

        {artists.length > 0 && (
          <FilterRow label="Исполнитель">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={musicFilterHref(state, {
                  artist: state.artist === artist.slug ? null : artist.slug,
                })}
                className={`${chip} ${state.artist === artist.slug ? chipOn : chipOff}`}
              >
                {artist.name}
              </Link>
            ))}
          </FilterRow>
        )}

        {active > 0 && (
          <Link
            href={musicFilterHref(state, {
              category: null,
              artist: null,
            })}
            className="w-fit text-xs text-cyan hover:text-magenta"
          >
            Снять фильтры
          </Link>
        )}
      </div>
    </details>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-2">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
