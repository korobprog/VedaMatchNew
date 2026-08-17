import { createHash } from 'node:crypto';

/**
 * Отпечаток объявления для поиска дублей у одного автора.
 *
 * Считается по нормализованному тексту: «Отдам холодильник!!!» и «отдам
 * холодильник» — одно и то же объявление, опубликованное дважды по ошибке
 * или ради подъёма в ленте.
 *
 * Нормализация разбивает текст на токены, а не чистит регуляркой с `\b`:
 * в JS граница слова определена по ASCII и вокруг кириллицы не срабатывает.
 */
export function noticeFingerprint(input: {
  kind: string;
  rubricId: string;
  title?: string | null;
  description?: string | null;
}): string {
  const text = normalize(
    `${input.title ?? ''} ${input.description ?? ''}`,
  ).slice(0, 500);
  // Рубрика и вид входят в отпечаток: «ищу коляску» и «отдам коляску» —
  // разные объявления с почти одинаковым текстом.
  const payload = `${input.kind}|${input.rubricId}|${text}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}
