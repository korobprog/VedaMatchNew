/**
 * Подсветка выделений и заметок в тексте главы (VED-662, часть 2).
 *
 * Выделение хранится смещениями в тексте блока (`selectionToRange`), а не
 * разметкой: HTML главы приходит из пакета книги и не меняется. Поэтому
 * подсветка накладывается на готовый DOM поверх — обёртками `<mark>`, — и
 * снимается перед каждым новым наложением. Текст блока от обёрток не
 * меняется, так что смещения остаются верными.
 */

export interface ReaderMark {
  id: string;
  start: number;
  end: number;
  kind: "highlight" | "note";
}

const MARK_ATTR = "data-vb-mark";
const COLOR_ATTR = "data-vb-color";

/** Снимает всю наложенную подсветку и раскраску внутри `root`. */
export function clearMarks(root: HTMLElement): void {
  for (const mark of root.querySelectorAll(
    `mark[${MARK_ATTR}], span[${COLOR_ATTR}]`,
  )) {
    mark.replaceWith(...mark.childNodes);
  }
  root.normalize();
}

/**
 * Оборачивает `[start, end)` текста блока в `<mark>`. Диапазон может
 * пересекать теги (`<i>`, `<b>`): каждый затронутый текстовый узел
 * оборачивается отдельно. Диапазон за пределами текста обрезается,
 * пустой — пропускается.
 */
export function applyMark(block: HTMLElement, mark: ReaderMark): void {
  wrapRange(block, mark.start, mark.end, (doc) => {
    const wrapper = doc.createElement("mark");
    wrapper.setAttribute(MARK_ATTR, mark.id);
    wrapper.dataset.kind = mark.kind;
    wrapper.className = "reader-mark rounded-sm";
    return wrapper;
  });
}

/**
 * Цветной перевод (VED-683): отрезок текста блока — цветом из палитры
 * читалки (`reader-color-*` в globals.css), под её тему.
 */
export function applyColor(
  block: HTMLElement,
  span: { start: number; end: number; color: string },
): void {
  wrapRange(block, span.start, span.end, (doc) => {
    const wrapper = doc.createElement("span");
    wrapper.setAttribute(COLOR_ATTR, span.color);
    wrapper.className = `reader-color-${span.color}`;
    return wrapper;
  });
}

function wrapRange(
  block: HTMLElement,
  start: number,
  end: number,
  make: (doc: Document) => HTMLElement,
): void {
  const mark = { start, end };
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const pieces: Array<{ node: Text; from: number; to: number }> = [];
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const length = text.data.length;
    const from = Math.max(mark.start, offset) - offset;
    const to = Math.min(mark.end, offset + length) - offset;
    if (from < to) pieces.push({ node: text, from, to });
    offset += length;
    if (offset >= mark.end) break;
  }
  for (const { node, from, to } of pieces) {
    const middle = from > 0 ? node.splitText(from) : node;
    if (to - from < middle.data.length) middle.splitText(to - from);
    const wrapper = make(doc);
    middle.replaceWith(wrapper);
    wrapper.append(middle);
  }
}
