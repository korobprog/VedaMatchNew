import { LANGUAGES_MAX } from '@vedamatch/shared';

/**
 * Языки портального профиля: без пустых, без повторов, не длиннее предела.
 *
 * Повторы приходят не от злого умысла, а от переноса из двух анкет и от
 * ручного ввода: «Русский» и «русский» — один язык, и в фильтре справочника
 * они не должны считаться дважды.
 */
export function normalizeLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, 40);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= LANGUAGES_MAX) break;
  }
  return result;
}
