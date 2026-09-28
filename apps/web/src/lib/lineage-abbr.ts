import { LINEAGES } from "@vedamatch/shared";

/**
 * Аббревиатуры линий (VED-634): снаружи везде только «ISKCON» и «IPBYS»
 * по-английски, а расшифровка по-русски открывается значком «?» рядом.
 * Список берётся из справочника линий: аббревиатура — та строка, у которой
 * есть расшифровка (`hint`). Логика без разметки — её проверяют тесты без DOM.
 */
export interface Abbreviation {
  /** «ISKCON». */
  abbr: string;
  /** «Международное общество сознания Кришны». */
  expansion: string;
}

export const LINEAGE_ABBREVIATIONS: readonly Abbreviation[] = LINEAGES.flatMap(
  (item) => (item.hint ? [{ abbr: item.label, expansion: item.hint }] : []),
);

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, "u").test(text);
}

/**
 * Аббревиатуры линий, которые стоят в подписи отдельными словами, в порядке
 * справочника: «ISKCON», «Гаудия-матх — IPBYS», «ISKCON, IPBYS». Пусто —
 * расшифровывать нечего.
 */
export function abbreviationsIn(
  text: string | null | undefined,
): Abbreviation[] {
  if (!text) return [];
  return LINEAGE_ABBREVIATIONS.filter((item) => hasWord(text, item.abbr));
}

/** Первая аббревиатура в подписи или `null`. */
export function abbreviationIn(
  text: string | null | undefined,
): Abbreviation | null {
  return abbreviationsIn(text)[0] ?? null;
}

/** Имя кнопки «?» для скринридера: «Что такое ISKCON». */
export function abbreviationHelpLabel(abbr: string): string {
  return `Что такое ${abbr}`;
}
