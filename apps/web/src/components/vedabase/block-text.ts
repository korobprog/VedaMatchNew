/**
 * Простой текст раздела стиха — для кнопки «Копировать» (VED-130).
 *
 * `textContent` склеил бы абзацы комментария в одну строку, а `innerText`
 * в тестовом окружении не работает и зависит от вёрстки. Поэтому абзацы и
 * пункты списков разделяются пустой строкой, `<br>` — переносом, а пробелы из
 * разметки внутри строки схлопываются.
 */
const BLOCK_TAGS = new Set([
  "blockquote",
  "div",
  "h2",
  "h3",
  "h4",
  "li",
  "ol",
  "p",
  "ul",
]);

export function readerBlockText(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const parts: string[] = [];
  collect(body, parts);
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collect(node: Node, parts: string[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // Перевод строки в исходной разметке — не перенос в тексте.
      parts.push((child.textContent ?? "").replace(/\s+/g, " "));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = (child as Element).tagName.toLowerCase();
    if (tag === "br") {
      parts.push("\n");
      continue;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push("\n\n");
    collect(child, parts);
    if (block) parts.push("\n\n");
  }
}
