import sharp from 'sharp';
import { BRAND_LOGO_ASPECT, brandLogoBuffer } from './story-brand';
import { withPngText } from './png-metadata';

/** Полный кадр вертикальной сторис. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const SIDE_PADDING = 88;
const BOTTOM_PADDING = 180;
const QUOTE_SIZE = 54;
const QUOTE_LINE_HEIGHT = 74;
const META_SIZE = 30;
/** Высота знака в кадре. Ширина считается из пропорций исходника. */
const BRAND_LOGO_HEIGHT = 76;
const DISCLOSURE_SIZE = 22;

/**
 * Отметка об авторстве и о том, что кадр синтетический.
 *
 * Не украшение: с августа 2026 AI Act требует маркировать сгенерированный
 * контент, а площадки всё чаще проставляют такие метки сами — и лучше, когда
 * это делаем мы, а не алгоритм соцсети поверх нашего кадра. Авторство и
 * маркировка сведены в одну строку намеренно: знак внизу и без того называет
 * бренд, а вторая подпись рядом читалась бы как повтор. Текст приглушённый —
 * он должен быть читаем, но не спорить с цитатой.
 */
export const AI_DISCLOSURE = 'Создано нейросетью в VedaMatch';
const META_LINE_HEIGHT = 40;
const MAX_QUOTE_LINES = 12;
const MAX_META_LINES = 2;
/** Запас на неточность оценки ширины: лучше перенести раньше, чем срезать край. */
const WIDTH_SAFETY = 0.96;

/**
 * Шрифты ставятся в образ (см. Dockerfile). Noto перечислен первым: он
 * покрывает кириллицу, латиницу и деванагари, то есть все три языка постов.
 */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const FONT_STACK =
  "'Noto Sans','Noto Sans Devanagari','DejaVu Sans',sans-serif";

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
};

/**
 * Где стоит знак. Отдельной функцией, потому что нужен и вёрстке текста (чтобы
 * подняться над знаком), и наложению картинки поверх SVG.
 */
export function brandLogoBox(): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const height = BRAND_LOGO_HEIGHT;
  const width = Math.round(height * BRAND_LOGO_ASPECT);
  return {
    left: SIDE_PADDING,
    top: STORY_HEIGHT - BOTTOM_PADDING + 96 - height,
    width,
    height,
  };
}

export function buildStoryOverlaySvg(input: StoryOverlayInput): string {
  const maxWidth = (STORY_WIDTH - SIDE_PADDING * 2) * WIDTH_SAFETY;
  const lines = clampLines(
    wrapText(input.text, QUOTE_SIZE, maxWidth),
    MAX_QUOTE_LINES,
  );
  // Атрибуция переносится так же, как цитата: одной строкой длинная связка
  // «автор · произведение · глава» уезжала за правый край.
  const metaLines = input.attribution?.trim()
    ? clampLines(
        wrapText(input.attribution, META_SIZE, maxWidth),
        MAX_META_LINES,
      )
    : [];

  // Знак стоит там же, где раньше стояла надпись «VedaMatch», но занимает
  // высоту картинки, поэтому текст над ним поднимается на эту высоту.
  const logo = brandLogoBox();
  const metaBottom = logo.top - 44;
  const metaTop = metaBottom - (metaLines.length - 1) * META_LINE_HEIGHT;
  const quoteBottom = metaLines.length > 0 ? metaTop - 58 : logo.top - 58;
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
    .disclosure { font-family: ${FONT_STACK}; font-size: ${DISCLOSURE_SIZE}px; fill: #B9A9DC; }
  </style>
  <rect x="0" y="${scrimTop}" width="${STORY_WIDTH}" height="${STORY_HEIGHT - scrimTop}" fill="url(#scrim)"/>
  ${quoteLines}
  ${attributionLine}
  <text x="${STORY_WIDTH - SIDE_PADDING}" y="${logo.top + logo.height - 6}" text-anchor="end" class="disclosure">${escapeXml(AI_DISCLOSURE)}</text>
</svg>`;
}

/**
 * Готовый слой подписи: текст из SVG плюс знак поверх него.
 *
 * Один на картинку и на ролик — иначе они разъедутся при первой же правке
 * отступов, а знак пришлось бы вклеивать дважды.
 */
export async function renderStoryOverlay(
  input: StoryOverlayInput,
): Promise<Buffer> {
  const box = brandLogoBox();
  const logo = await sharp(brandLogoBuffer())
    .resize(box.width, box.height, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  return sharp(Buffer.from(buildStoryOverlaySvg(input)))
    .composite([{ input: logo, left: box.left, top: box.top }])
    .png()
    .toBuffer();
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
  const framed = await sharp(canvas)
    .composite([{ input: await renderStoryOverlay(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
  // Та же отметка, что и на пикселях, но в метаданных: надпись площадка может
  // обрезать при перекадрировании, а чанк читает автоматика.
  return withPngText(framed, [
    { keyword: 'Comment', text: AI_DISCLOSURE },
    { keyword: 'Software', text: 'VedaMatch' },
  ]);
}
