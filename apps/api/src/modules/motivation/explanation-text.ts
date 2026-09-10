/**
 * Пояснение живёт в одной строке с цитатой, склеенное пустой строкой (см.
 * motivation-copy.service.ts). Отдельного поля у него нет — а подписывать
 * его именем и принимать на него жалобы надо, поэтому нужен способ достать
 * пояснение из текста и понять, изменилось ли оно.
 */

/** Часть после первой пустой строки. Пусто — пояснения нет. */
export function explanationOf(text: string): string {
  const separator = text.indexOf('\n\n');
  return separator === -1 ? '' : text.slice(separator + 2).trim();
}

/**
 * Изменилось ли пояснение между двумя версиями текста.
 *
 * Сравниваем только пояснение, а не текст целиком: правка опечатки в самой
 * цитате не делает администратора автором трактовки, которую написал кто-то
 * другой. Пробелы по краям не в счёт — они не меняют смысла.
 */
export function explanationChanged(before: string, after: string): boolean {
  return explanationOf(before) !== explanationOf(after);
}

/** Длиннее пояснение не принимаем: это трактовка, а не статья. */
export const MAX_EXPLANATION_LENGTH = 800;

/**
 * Можно ли добавить пояснение к этому тексту.
 *
 * Пояснение у афоризма одно. Второй человек не переписывает трактовку
 * первого — он с ней спорит жалобой (VED-49), а не поверх неё.
 */
export function canAddExplanation(text: string): boolean {
  return explanationOf(text) === '';
}

/**
 * Приводит присланное пояснение к тому, что можно хранить, или отдаёт `null`,
 * если хранить нечего.
 *
 * Пустая строка внутри разрезала бы текст второй раз: `explanationOf` берёт
 * всё после ПЕРВОГО разрыва, поэтому смысл не потеряется, но лишние пустые
 * строки в карточке выглядят дырой. Схлопываем их в одну.
 */
export function normalizeExplanation(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? null : text.slice(0, MAX_EXPLANATION_LENGTH);
}

/**
 * Складывает цитату и пояснение так, как их хранит сервис: пустой строкой
 * между ними. Цитату берём из исходного текста — у поста без пояснения это
 * он весь.
 */
export function withExplanation(text: string, explanation: string): string {
  return `${quoteOf(text)}\n\n${explanation}`;
}

/** Часть до первой пустой строки — сама цитата, без чьей-либо трактовки. */
export function quoteOf(text: string): string {
  const separator = text.indexOf('\n\n');
  return (separator === -1 ? text : text.slice(0, separator)).trim();
}
