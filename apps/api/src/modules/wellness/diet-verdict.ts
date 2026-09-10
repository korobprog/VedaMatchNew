import type {
  WellnessIngredientClass,
  WellnessVerdict,
  WellnessVerdictReason,
  WellnessVerdictResult,
} from '@vedamatch/shared';
import type { WellnessIngredientMatch } from './ingredient-match';

/**
 * Ответ человеку у полки.
 *
 * Главное правило: молчать нельзя. Если состав разобран не до конца, вердикт
 * `unknown` — а не `clean`. Сказать «подходит» там, где мы не разобрали
 * половину строки, значит соврать человеку, который на нас положился.
 *
 * Второе правило: запись со скрытой формулировкой («натуральный
 * ароматизатор», «специи») не судится по классу `other` — она честно уходит в
 * непонятое. За такой строкой может стоять лук, и мы этого не знаем.
 */

export interface WellnessDietRestrictions {
  excluded: WellnessIngredientClass[];
  /** Отдельные ключи справочника поверх классов: «мне нельзя именно кармин». */
  excludedKeys: string[];
}

function toReason(match: WellnessIngredientMatch): WellnessVerdictReason {
  return {
    ingredient: {
      key: match.entry.key,
      name: match.entry.name ?? match.entry.key,
      class: match.entry.class,
      eNumber: match.entry.eNumber ?? null,
      note: match.entry.note ?? null,
    },
    matchedText: match.matchedText,
    severity: match.severity,
  };
}

export function resolveVerdict(
  matches: WellnessIngredientMatch[],
  unrecognized: string[],
  restrictions: WellnessDietRestrictions,
): WellnessVerdictResult {
  const excluded = new Set<string>(restrictions.excluded);
  const excludedKeys = new Set(restrictions.excludedKeys);
  const unclear = [...unrecognized];

  const relevant: WellnessIngredientMatch[] = [];
  for (const match of matches) {
    // Скрытая формулировка класса `other` ничего не утверждает о составе.
    // Она не запрещает продукт, но и не даёт назвать его чистым.
    if (match.severity === 'hidden' && match.entry.class === 'other') {
      unclear.push(match.matchedText);
      continue;
    }
    if (excluded.has(match.entry.class) || excludedKeys.has(match.entry.key)) {
      relevant.push(match);
    }
  }

  // Ограничений нет — судить не о чем: показываем состав и молчим.
  if (excluded.size === 0 && excludedKeys.size === 0) {
    return { verdict: 'clean', reasons: [], unrecognized: unclear };
  }

  const reasons = relevant.map(toReason);
  const verdict: WellnessVerdict = relevant.some(
    (match) => match.severity === 'contains',
  )
    ? 'forbidden'
    : relevant.length > 0
      ? 'warning'
      : unclear.length > 0
        ? 'unknown'
        : 'clean';

  return { verdict, reasons, unrecognized: unclear };
}
