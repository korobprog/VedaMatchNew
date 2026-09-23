import type {
  MotivationCategoryDto,
  MotivationPreferenceDto,
} from "@vedamatch/shared";
import { WIDGET_CATEGORY, widgetCategorySlug } from "@/lib/motivation-widget-feed";
import { reelsHref } from "./feed-style";

/**
 * Две кнопки в карточке «Вдохновения» на главной (VED-401):
 *
 * 1. «Лента источника» — лента одной книги по порядку стихов (VED-389:
 *    фильтр по источнику всегда идёт по номерам). По умолчанию Бхагавад-гита.
 * 2. «Открытки папки» — открытки одного раздела. По умолчанию «Мудрость
 *    мира».
 *
 * Обе участник перенастраивает в «Настройках ленты»; выбор лежит на сервере
 * (`MotivationPreference.homeSourceWork` / `homeCategorySlug`), пустое поле
 * — умолчание отсюда. Умолчание не пишется в базу, поэтому его можно
 * поменять, не трогая ничьих настроек.
 */

/**
 * Источник по умолчанию. Строка сравнивается с постами по нормализованному
 * ключу (`attributionKey` на сервере): «Бхагавад-гита 2.7», «бхагавад–гита»
 * и «Бхагавад-гита, глава 2, стих 7» — одна книга.
 */
export const DEFAULT_HOME_SOURCE_WORK = "Бхагавад-гита";

/**
 * Папка по умолчанию — та же, из которой карточка берёт афоризм: по слагу
 * `filosofiya-2`, а не по названию (переименование «Философии» в «Мудрость
 * мира» уже однажды ломало поиск по названию, см. `WIDGET_CATEGORY`).
 */
export const DEFAULT_HOME_CATEGORY = WIDGET_CATEGORY;

export interface HomeButton {
  href: string;
  /** Что это за лента — для подписи и скринридера. */
  title: string;
  /** Выбрано участником, а не умолчание. */
  custom: boolean;
}

export interface HomeButtons {
  source: HomeButton;
  /** Нет ни выбранной, ни умолчательной папки — кнопки нет. */
  cards: HomeButton | null;
}

type HomePreference = Pick<
  MotivationPreferenceDto,
  "homeSourceWork" | "homeCategorySlug"
>;

/** Ссылка на ленту одного источника. */
export function sourceFeedHref(work: string): string {
  return reelsHref({ work });
}

/**
 * Ссылка на открытки папки. Открыток в папке нет, а афоризмы есть — ведём
 * в «Ленту» той же папки: кнопка в пустой экран хуже, чем в соседнюю
 * вкладку того же раздела.
 */
export function categoryCardsHref(
  category: Pick<MotivationCategoryDto, "slug" | "artCount" | "cardsCount">,
): string {
  const onlyArt = (category.cardsCount ?? 0) === 0 && (category.artCount ?? 0) > 0;
  return reelsHref({ tab: onlyArt ? "forYou" : "cards", category: category.slug });
}

export function resolveHomeButtons(
  preference: HomePreference | null | undefined,
  categories: readonly MotivationCategoryDto[] | null | undefined,
): HomeButtons {
  const chosenWork = preference?.homeSourceWork?.trim();
  const work = chosenWork || DEFAULT_HOME_SOURCE_WORK;

  const list = categories ?? [];
  // Выбранную папку могли удалить — тогда кнопка возвращается к умолчанию.
  const chosen = preference?.homeCategorySlug
    ? list.find((category) => category.slug === preference.homeCategorySlug)
    : undefined;
  const fallbackSlug = chosen ? null : widgetCategorySlug(list);
  const category =
    chosen ?? list.find((item) => item.slug === fallbackSlug) ?? null;

  return {
    source: {
      href: sourceFeedHref(work),
      title: work,
      custom: Boolean(chosenWork),
    },
    cards: category
      ? {
          href: categoryCardsHref(category),
          title: category.title,
          custom: Boolean(chosen),
        }
      : null,
  };
}

export interface HomeButtonOption {
  value: string;
  label: string;
}

/**
 * Пункты выбора источника в настройках. Первым — «по умолчанию» (пустое
 * значение); название впереди пометки: на 320px поле обрезает конец строки,
 * и видно должно остаться, что выбрано. Сохранённый источник, которого сейчас нет в списке (все стихи
 * сняли с показа), остаётся пунктом: иначе форма молча показала бы другой
 * выбор, и сохранение затёрло бы настройку.
 */
export function sourceOptions(
  works: readonly { label: string; count: number }[],
  saved: string | null | undefined,
): HomeButtonOption[] {
  const options: HomeButtonOption[] = [
    { value: "", label: `${DEFAULT_HOME_SOURCE_WORK} — по умолчанию` },
    ...works.map((work) => ({
      value: work.label,
      label: `${work.label} (${work.count})`,
    })),
  ];
  const kept = saved?.trim();
  if (kept && !options.some((option) => option.value === kept))
    options.push({ value: kept, label: kept });
  return options;
}

/**
 * Пункты выбора папки. Пустые папки не предлагаем: кнопка в пустую ленту —
 * не то, что ищут. Сохранённая папка остаётся пунктом, даже если опустела.
 */
export function categoryOptions(
  categories: readonly MotivationCategoryDto[],
  saved: string | null | undefined,
): HomeButtonOption[] {
  const fallbackSlug = widgetCategorySlug(categories);
  const fallback = categories.find((category) => category.slug === fallbackSlug);
  const cardsWord = (count: number) => `открыток: ${count}`;
  return [
    {
      value: "",
      label: `${fallback?.title ?? DEFAULT_HOME_CATEGORY.titles[0]} — по умолчанию`,
    },
    ...categories
      .filter(
        (category) =>
          category.slug === saved ||
          (category.cardsCount ?? 0) + (category.artCount ?? 0) > 0,
      )
      .map((category) => ({
        value: category.slug,
        label:
          (category.cardsCount ?? 0) > 0
            ? `${category.title} (${cardsWord(category.cardsCount)})`
            : `${category.title} (только афоризмы)`,
      })),
  ];
}
