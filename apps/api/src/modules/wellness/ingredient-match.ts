import type {
  WellnessIngredientClass,
  WellnessIngredientSeverity,
} from '@vedamatch/shared';
import {
  normalizeENumbers,
  type WellnessCompositionToken,
} from './ingredient-parse';

/**
 * Сопоставление позиций состава со справочником.
 *
 * Совпадение ищется по алиасам, а не по названию: на этикетках пишут
 * «сычужный фермент», «rennet» и «E1105» — это одна запись справочника.
 * Совпадение считается только по целому слову: иначе «лук» находится внутри
 * «клубника», и человеку отвечают неправдой.
 *
 * Словоформы не угадываются. Не совпало — администратор добавляет алиас;
 * ровно для этого справочник и редактируется из админки.
 */

export interface WellnessIngredientEntry {
  key: string;
  aliases: string[];
  class: WellnessIngredientClass;
  severity: WellnessIngredientSeverity;
  /// Заполняются из справочника: их видит человек в причине вердикта.
  name?: string;
  eNumber?: string | null;
  note?: string | null;
}

export interface WellnessIngredientMatch {
  entry: WellnessIngredientEntry;
  /** Кусок этикетки, на котором сработало правило. */
  matchedText: string;
  /**
   * Итоговая тяжесть: «может содержать следы» смягчает даже прямое указание,
   * потому что в продукте этого может и не быть.
   */
  severity: WellnessIngredientSeverity;
  position: number;
}

export interface WellnessMatchResult {
  matches: WellnessIngredientMatch[];
  /** Позиции, которых нет в справочнике. Из них рождается вердикт `unknown`. */
  unrecognized: string[];
}

const LETTER = /[\p{L}\p{N}]/u;

/** Целое слово: слева и справа от алиаса не должно быть букв или цифр. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1];
    const afterAt = at + needle.length;
    const after = afterAt >= haystack.length ? '' : haystack[afterAt];
    if (!LETTER.test(before || ' ') && !LETTER.test(after || ' ')) return true;
    from = at + 1;
  }
}

function normalizeAlias(alias: string): string {
  // Тот же вид, к которому разбор приводит позиции состава, включая E-номера:
  // иначе алиас «Е471» с кириллической «Е» не совпал бы сам с собой.
  return normalizeENumbers(alias)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchIngredients(
  tokens: WellnessCompositionToken[],
  entries: WellnessIngredientEntry[],
): WellnessMatchResult {
  const prepared = entries.map((entry) => ({
    entry,
    aliases: [...entry.aliases, entry.key]
      .map(normalizeAlias)
      .filter(Boolean)
      // Длинные алиасы вперёд: «сычужный фермент» точнее, чем «фермент».
      .sort((a, b) => b.length - a.length),
  }));

  const matches: WellnessIngredientMatch[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    let hit = false;
    for (const candidate of prepared) {
      const alias = candidate.aliases.find((value) =>
        containsWord(token.text, value),
      );
      if (!alias) continue;
      hit = true;
      if (seen.has(candidate.entry.key)) continue;
      seen.add(candidate.entry.key);
      matches.push({
        entry: candidate.entry,
        matchedText: token.raw,
        severity: token.mayContain ? 'mayContain' : candidate.entry.severity,
        position: token.position,
      });
    }
    if (!hit) unrecognized.push(token.raw);
  }

  return { matches, unrecognized };
}
