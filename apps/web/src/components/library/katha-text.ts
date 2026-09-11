/**
 * Абзацы текста катхи для страницы материала.
 *
 * Абзац — всё, что между пустыми строками. Одиночный перевод строки
 * остаётся внутри абзаца: на нём держатся стихи и реплики беседы, и
 * страница показывает его как есть через `whitespace-pre-line`.
 */
export function kathaParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
