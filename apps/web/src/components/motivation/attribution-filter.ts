import type { MotivationPostDto } from "@vedamatch/shared";
import { feedStyleOf, reelsHref, type ReelsTab } from "./feed-style";

/**
 * Фильтр ленты по автору и источнику (VED-206): чистая часть — адреса,
 * запрос списка и сравнение названий. Компонент только рисует.
 */

export interface FeedFilterState {
  tab: ReelsTab;
  order?: "random";
  category?: string;
  speaker?: string;
  work?: string;
}

/**
 * Одна книга приходит в разных написаниях, и сервер их склеивает. Отметка
 * «выбрано» в списке сравнивает так же, иначе выбранная «бхагавад-гита»
 * не подсветила бы пункт «Бхагавад-гита».
 */
export function sameAttribution(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .replace(/[‐‑‒–—―−]/g, "-")
      .replace(/\s*-\s*/g, "-")
      .replace(/["«»„“”'’`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,;:]+$/, "")
      .trim();
  const left = key(a);
  return left.length > 0 && left === key(b);
}

/**
 * Адрес ленты с другим фильтром. Вкладка и папка остаются: фильтр сужает
 * текущую ленту, а не уводит в другую. Из избранного — в «Для вас»: у
 * избранного фильтров нет.
 *
 * Порядок остаётся, кроме одного случая: выбран источник. Лента источника
 * всегда идёт по номерам стихов (VED-389) — сервер «вперемешку» для неё не
 * слушает, и `order=random` в адресе только врал бы переключателю порядка.
 */
export function filterHref(
  state: FeedFilterState,
  change: { speaker?: string | null; work?: string | null },
): string {
  const speaker = change.speaker === undefined ? state.speaker : change.speaker ?? undefined;
  const work = change.work === undefined ? state.work : change.work ?? undefined;
  return reelsHref({
    tab: state.tab === "saved" ? "forYou" : state.tab,
    order: work?.trim() ? undefined : state.order,
    category: state.category,
    speaker,
    work,
  });
}

/**
 * Подпись кнопки фильтра для скринридера.
 *
 * Чипа «📖 Бхагавад-гита ✕» поверх картинки больше нет (VED-389: «надпись
 * мешает, и так понятно»). Глазами активный фильтр видно по точке на
 * значке, а голосом — только из этой подписи, поэтому она называет, что
 * выбрано, и говорит, где его снять.
 */
export function filterTriggerLabel(state: Pick<FeedFilterState, "speaker" | "work">): string {
  const parts = [
    state.work?.trim() && `источник «${state.work.trim()}»`,
    state.speaker?.trim() && `автор «${state.speaker.trim()}»`,
  ].filter(Boolean);
  if (parts.length === 0) return "Фильтр по автору и источнику";
  return `Фильтр включён: ${parts.join(", ")}. Изменить или снять`;
}

/** Запрос списка авторов и источников — с теми же папкой и вкладкой. */
export function attributionsQuery(state: FeedFilterState): string {
  const query = new URLSearchParams();
  if (state.category) query.set("category", state.category);
  const style = feedStyleOf(state.tab);
  if (style) query.set("style", style);
  if (state.speaker) query.set("speaker", state.speaker);
  if (state.work) query.set("work", state.work);
  return query.toString();
}

/** Включён ли хоть один фильтр. */
export function hasAttributionFilter(state: Pick<FeedFilterState, "speaker" | "work">): boolean {
  return Boolean(state.speaker?.trim() || state.work?.trim());
}

/**
 * Подпись источника на слайде по графам (VED-140), каждая со своей ролью:
 * автор и книга включают фильтр (VED-206), стих ведёт на первоисточник.
 */
export type AttributionFieldKind = "speaker" | "work" | "locator";

export function attributionFields(
  post: Pick<MotivationPostDto, "attributionSpeaker" | "attributionWork" | "attributionLocator">,
): { kind: AttributionFieldKind; text: string }[] {
  const work = post.attributionWork?.trim() || null;
  const locator = stripWorkPrefix(post.attributionLocator?.trim() || null, work);
  const speaker = post.attributionSpeaker?.trim() || null;
  const fields: { kind: AttributionFieldKind; text: string }[] = [];
  if (speaker) fields.push({ kind: "speaker", text: speaker });
  if (work) fields.push({ kind: "work", text: work });
  if (locator) fields.push({ kind: "locator", text: locator });
  return fields;
}

/**
 * Иногда генерация кладёт название произведения ещё раз в начало главы/стиха
 * («Бхагавад-гита как она есть 6.1» вместо «6.1») — тогда оно дублируется в
 * подписи. Сравнение без учёта регистра: разные генерации расходятся в
 * заглавных буквах чаще, чем в самом тексте.
 */
export function stripWorkPrefix(locator: string | null, work: string | null): string | null {
  if (!locator || !work) return locator;
  if (!locator.toLocaleLowerCase().startsWith(work.toLocaleLowerCase())) return locator;
  const rest = locator.slice(work.length).replace(/^[·,:\s-]+/, "").trim();
  return rest || null;
}
