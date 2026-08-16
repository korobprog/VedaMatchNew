import sharp from 'sharp';

/** Полный кадр вертикальной сторис. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const SIDE_PADDING = 88;
const BOTTOM_PADDING = 180;
const QUOTE_SIZE = 54;
const QUOTE_LINE_HEIGHT = 74;
const META_SIZE = 30;
const BRAND_SIZE = 32;
const META_LINE_HEIGHT = 40;
const MAX_QUOTE_LINES = 12;
const MAX_META_LINES = 2;
/** Запас на неточность оценки ширины: лучше перенести раньше, чем срезать край. */
const WIDTH_SAFETY = 0.96;

/**
 * Шрифты ставятся в образ (см. Dockerfile). Noto перечислен первым: он
 * покрывает кириллицу, латиницу и деванагари, то есть все три языка постов.
 */
const FONT_STACK = "'Noto Sans','Noto Sans Devanagari','DejaVu Sans',sans-serif";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Ширина глифа в долях кегля. Точные метрики шрифта здесь недоступны, а
 * переносить строки надо до отрисовки, поэтому оцениваем: заглавные и
 * деванагари шире строчных, пробел и узкие знаки — уже.
 */
function glyphWidth(char: string): number {
  if (/\s/.test(char)) return 0.28;
  // Тире шире буквы: без этого строка с «—» вылезала за правый край.
  if (char === '—') return 1;
  if (/[–«»]/.test(char)) return 0.55;
  if (/[.,;:!?'’·|]/.test(char)) return 0.28;
  if (/[ilj]/.test(char)) return 0.3;
  if (/[A-ZА-ЯЁ]/.test(char)) return 0.66;
  if (/[ऀ-ॿ]/.test(char)) return 0.62;
  if (/[mwшщыюжфМШЩЫЮЖФ]/.test(char)) return 0.85;
  return 0.55;
}

function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) width += glyphWidth(char) * fontSize;
  return width;
}

/**
 * Перенос по словам. Слово длиннее строки рвётся по символам — иначе оно
 * вылезло бы за кадр.
 */
export function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (textWidth(word, fontSize) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const char of word) {
        if (textWidth(chunk + char, fontSize) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else chunk += char;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Обрезает хвост многоточием, чтобы блок не уехал за верх кадра. */
export function clampLines(lines: string[], limit: number): string[] {
  if (lines.length <= limit) return lines;
  const kept = lines.slice(0, limit);
  kept[limit - 1] = `${kept[limit - 1].replace(/[\s.,;:]+$/, '')}…`;
  return kept;
}

export type StoryOverlayInput = {
  /** Текст цитаты для сторис. */
  text: string;
  /** Автор, произведение, глава — пустые части выбрасываются вызывающим. */
  attribution?: string | null;
  brand?: string;
};

export function buildStoryOverlaySvg(input: StoryOverlayInput): string {
  const maxWidth = (STORY_WIDTH - SIDE_PADDING * 2) * WIDTH_SAFETY;
  const lines = clampLines(
    wrapText(input.text, QUOTE_SIZE, maxWidth),
    MAX_QUOTE_LINES,
  );
  const brand = input.brand ?? 'VedaMatch';
  // Атрибуция переносится так же, как цитата: одной строкой длинная связка
  // «автор · произведение · глава» уезжала за правый край.
  const metaLines = input.attribution?.trim()
    ? clampLines(
        wrapText(input.attribution, META_SIZE, maxWidth),
        MAX_META_LINES,
      )
    : [];

  const brandY = STORY_HEIGHT - BOTTOM_PADDING + 96;
  const metaBottom = brandY - 62;
  const metaTop = metaBottom - (metaLines.length - 1) * META_LINE_HEIGHT;
  const quoteBottom = metaLines.length > 0 ? metaTop - 58 : brandY - 58;
  const firstLineY = quoteBottom - (lines.length - 1) * QUOTE_LINE_HEIGHT;

  // Подложка тянется выше самой верхней строки, иначе светлый фон съедает текст.
  const scrimTop = Math.max(0, firstLineY - QUOTE_SIZE - 80);

  const quoteLines = lines
    .map(
      (line, index) =>
        `<text x="${SIDE_PADDING}" y="${firstLineY + index * QUOTE_LINE_HEIGHT}" class="quote">${escapeXml(line)}</text>`,
    )
    .join('');

  const attributionLine = metaLines
    .map(
      (line, index) =>
        `<text x="${SIDE_PADDING}" y="${metaTop + index * META_LINE_HEIGHT}" class="meta">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0614" stop-opacity="0"/>
      <stop offset="45%" stop-color="#0A0614" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#0A0614" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <style>
    .quote { font-family: ${FONT_STACK}; font-size: ${QUOTE_SIZE}px; font-weight: 600; fill: #FFFFFF; }
    .meta  { font-family: ${FONT_STACK}; font-size: ${META_SIZE}px; fill: #D9CCF5; }
    .brand { font-family: ${FONT_STACK}; font-size: ${BRAND_SIZE}px; font-weight: 700; fill: #FBCF6A; letter-spacing: 1px; }
  </style>
  <rect x="0" y="${scrimTop}" width="${STORY_WIDTH}" height="${STORY_HEIGHT - scrimTop}" fill="url(#scrim)"/>
  ${quoteLines}
  ${attributionLine}
  <text x="${SIDE_PADDING}" y="${brandY}" class="brand">${escapeXml(brand)}</text>
</svg>`;
}

/**
 * Кадр для сторис: фон докадрируется до 1080×1920 и получает поверх текст.
 *
 * Модель отдаёт 1024×1536 — это 2:3, а не 9:16, поэтому без докадрирования
 * картинка в сторис легла бы с полями. Текст накладываем сами, а не просим
 * нейросеть: цитата обязана быть дословной, а проверить буквы на пикселях
 * нечем.
 */
export async function composeStoryImage(
  background: Buffer,
  overlay: StoryOverlayInput,
): Promise<Buffer> {
  const canvas = await sharp(background)
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover', position: 'attention' })
    .toBuffer();
  return sharp(canvas)
    .composite([
      { input: Buffer.from(buildStoryOverlaySvg(overlay)), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
