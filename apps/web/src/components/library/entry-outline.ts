/**
 * Содержание текстового материала (VED-538): куда в тексте можно перейти.
 *
 * Текст материала — простой текст, без разметки заголовков, поэтому раздел
 * узнаём по виду абзаца: одна короткая строка без точки, запятой, точки с
 * запятой и двоеточия в конце — так пишут заголовок главы, «1. Введение»,
 * «Вопрос», дату беседы. Первый абзац — название материала, в содержание он
 * не идёт: оно и так в заголовке страницы.
 *
 * Заголовков нет, а текст длинный — содержание собирается из частей: текст
 * делится на равные куски по абзацам, раздел называется началом своего
 * первого абзаца. Короткому тексту без заголовков содержание не нужно.
 */

export interface OutlineItem {
  /** Номер абзаца в `kathaParagraphs` — на странице это якорь `#p-{index}`. */
  index: number;
  title: string;
}

/** Длиннее — уже абзац, а не заголовок. */
const HEADING_MAX_LENGTH = 90;

/** Меньше двух пунктов — это не содержание. */
const MIN_ITEMS = 2;

/** Сколько абзацев должно быть у текста без заголовков, чтобы делить его. */
const MIN_PARAGRAPHS_FOR_PARTS = 8;

/** Частей у текста без заголовков — не больше. */
const MAX_PARTS = 8;

/** Сколько знаков начала абзаца идёт в название части. */
const PART_TITLE_LENGTH = 60;

export function isHeadingParagraph(paragraph: string): boolean {
  const text = paragraph.trim();
  if (!text || text.includes("\n")) return false;
  if (text.length > HEADING_MAX_LENGTH) return false;
  return !/[.,;:]$/.test(text);
}

function clip(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= PART_TITLE_LENGTH) return line;
  const cut = line.slice(0, PART_TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function entryOutline(paragraphs: readonly string[]): OutlineItem[] {
  const headings = paragraphs
    .map((paragraph, index) => ({ index, title: paragraph.trim() }))
    // Первый абзац — название, последний заголовком быть не может: под ним
    // нечего читать.
    .filter(
      (item) =>
        item.index > 0 &&
        item.index < paragraphs.length - 1 &&
        isHeadingParagraph(item.title),
    );
  if (headings.length >= MIN_ITEMS) return headings;

  if (paragraphs.length < MIN_PARAGRAPHS_FOR_PARTS) return [];
  const parts = Math.min(MAX_PARTS, Math.floor(paragraphs.length / 4));
  const step = paragraphs.length / parts;
  const items: OutlineItem[] = [];
  for (let part = 0; part < parts; part += 1) {
    const index = Math.round(part * step);
    items.push({ index, title: clip(paragraphs[index]) });
  }
  return items;
}
