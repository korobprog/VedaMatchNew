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

  const relevant: WellnessIngredientMatch[] = [];
  const hidden: WellnessIngredientMatch[] = [];
  for (const match of matches) {
    // Скрытая формулировка класса `other` ничего не утверждает о составе.
    // Она не запрещает продукт, но и не даёт назвать его чистым — и это не то
    // же самое, что незнакомое слово: путать их значит врать в обе стороны.
    if (match.severity === 'hidden' && match.entry.class === 'other') {
      hidden.push(match);
      continue;
    }
    if (excluded.has(match.entry.class) || excludedKeys.has(match.entry.key)) {
      relevant.push(match);
    }
  }

  const hiddenReasons = hidden.map(toReason);

  // Ограничений нет — судить не о чем: показываем состав и молчим.
  if (excluded.size === 0 && excludedKeys.size === 0) {
    return {
      verdict: 'clean',
      reasons: [],
      hidden: hiddenReasons,
      unrecognized,
    };
  }

  const unclear = unrecognized.length > 0 || hidden.length > 0;
  const verdict: WellnessVerdict = relevant.some(
    (match) => match.severity === 'contains',
  )
    ? 'forbidden'
    : relevant.length > 0
      ? 'warning'
      : unclear
        ? 'unknown'
        : 'clean';

  return {
    verdict,
    reasons: relevant.map(toReason),
    hidden: hiddenReasons,
    unrecognized,
  };
}
