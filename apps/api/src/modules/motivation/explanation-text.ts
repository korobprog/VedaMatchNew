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
