import type {
  MotivationCategoryDto,
  MotivationFeedPositionUpdate,
} from "@vedamatch/shared";
import { feedStyleOf, reelsHref, type ReelsTab } from "./feed-style";

/**
 * «С того места, где остановился» на стороне ленты (VED-432).
 *
 * Лента раздела («Мудрость мира»), источника («Бхагавад-гита») и открыток
 * раздела читается подряд, как книга: кнопки «Вдохновения» на главной
 * открывают её новичку с начала, а вернувшемуся — с той картинки, на которой
 * он ушёл. Здесь — что считать такой лентой, что отправить серверу и что
 * сказать, когда лента кончилась.
 */

export interface FeedPlace {
  tab: ReelsTab;
  order?: "random";
  category?: string;
  speaker?: string;
  work?: string;
}

/**
 * Тело `PUT motivation/feed-position` для поста на экране. `null` — эта
 * лента позиции не помнит: личная, избранное, «Вперемешку» (у них нет
 * постоянного порядка, и «то же место» завтра было бы другим постом).
 * Исключение — «Вперемешку» в ленте источника: сервер всё равно ведёт её по
 * номерам стихов (VED-389).
 */
export function feedPositionBody(
  place: FeedPlace,
  post: string,
): MotivationFeedPositionUpdate | null {
  if (place.tab === "saved") return null;
  const work = place.work?.trim();
  const speaker = place.speaker?.trim();
  const category = place.category?.trim();
  if (!category && !work && !speaker) return null;
  if (place.order === "random" && !work) return null;
  return {
    post,
    style: feedStyleOf(place.tab),
    ...(category ? { category } : {}),
    ...(speaker ? { speaker } : {}),
    ...(work ? { work } : {}),
  };
}

/** Сколько пост должен провисеть на экране, чтобы считаться местом остановки. */
export const FEED_POSITION_DELAY_MS = 1500;

export interface FeedEnding {
  /** Заголовок финального слайда. */
  title: string;
  /** Ссылка «Начать сначала»; `null` — у ленты нет начала, к которому вернуться. */
  restartHref: string | null;
}

/**
 * Финальный слайд ленты раздела или источника: «вы посмотрели всё — начать
 * сначала или выбрать другой раздел». Кнопки разделов финальный слайд
 * рисует и так, здесь — заголовок и ссылка на начало той же ленты, без
 * `resume`, чтобы открыть её с первой картинки, а не с последней.
 *
 * У личной ленты и избранного финал прежний: «На сегодня это всё».
 */
export function feedEnding(
  place: FeedPlace,
  categories: readonly Pick<MotivationCategoryDto, "slug" | "title">[],
): FeedEnding {
  if (place.tab === "saved") return { title: "Это всё избранное", restartHref: null };
  const work = place.work?.trim();
  const speaker = place.speaker?.trim();
  const category = place.category?.trim();
  if (!category && !work && !speaker)
    return { title: "На сегодня это всё", restartHref: null };
  const restartHref = reelsHref({
    tab: place.tab,
    order: place.order,
    category,
    speaker,
    work,
  });
  const what = place.tab === "cards" ? "все открытки" : "все картинки";
  if (work) return { title: `Вы посмотрели ${what} источника «${work}»`, restartHref };
  if (speaker) return { title: `Вы посмотрели ${what} автора «${speaker}»`, restartHref };
  const title = categoryTitle(category!, categories);
  return {
    title: title ? `Вы посмотрели ${what} раздела «${title}»` : `Вы посмотрели ${what} раздела`,
    restartHref,
  };
}

/** Несколько папок через запятую — названием первой, как её знает человек. */
function categoryTitle(
  category: string,
  categories: readonly Pick<MotivationCategoryDto, "slug" | "title">[],
): string | null {
  const slugs = category.split(",").map((slug) => slug.trim());
  const titles = slugs
    .map((slug) => categories.find((item) => item.slug === slug)?.title)
    .filter((title): title is string => Boolean(title));
  return titles.length ? titles.join(", ") : null;
}
