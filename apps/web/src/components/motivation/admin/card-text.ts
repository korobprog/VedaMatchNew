import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { splitQuoteAndExplanation } from "../quote-text";
import { formatAttribution } from "./quote-details";

/**
 * Текст карточки редакции: свёрнутый и развёрнутый (VED-264).
 *
 * Заказчик просил «показать текст афоризма полностью — быстро, без
 * возвращения в ленту». Отдельная кнопка «Читать» для этого была, но VED-343
 * отдал её клетку «Поделиться» ради сетки 4×2. Теперь разворачивает сам
 * текст: нажал на афоризм — он раскрылся целиком вместе с пояснением и
 * подписью, нажал ещё раз — свернулся в четыре строки.
 */
export interface CardText {
  /** Сам афоризм. У открытки без набранного текста — заголовок или слаг. */
  quote: string;
  /** Пояснение под цитатой; пусто — его нет. */
  explanation: string;
  /** «Автор · Книга · Стих» без пустых частей; пусто — подписи нет. */
  attribution: string;
}

export function cardText(
  post: Pick<
    MotivationAdminCandidateDto,
    | "text"
    | "title"
    | "slug"
    | "attributionSpeaker"
    | "attributionWork"
    | "attributionLocator"
  >,
): CardText {
  const { quote, explanation } = splitQuoteAndExplanation(post.text ?? "");
  return {
    quote: quote || post.title?.trim() || post.slug,
    explanation,
    attribution: formatAttribution([
      post.attributionSpeaker,
      post.attributionWork,
      post.attributionLocator,
    ]),
  };
}

/**
 * Подсказка под текстом: без неё никто не догадается, что абзац нажимается.
 * Она же — хвост имени кнопки для скринридера, а состояние он узнаёт из
 * `aria-expanded`.
 */
export function expandHint(expanded: boolean): string {
  return expanded ? "Свернуть" : "Показать полностью";
}
