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
/** Поздравление открытки: кегль и отступ сверху. */
const GREETING_SIZE = 62;
const GREETING_LINE_HEIGHT = 78;
const GREETING_TOP = 200;
const MAX_GREETING_LINES = 2;

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
  /**
   * Поздравление для открытки («С Джанмаштами»). Стоит вверху кадра и
   * превращает ту же картинку в открытку: отдельного макета нет намеренно —
   * иначе правка отступов расходилась бы между сторис и открыткой.
   */
  greeting?: string | null;
  /** Сколько строк цитаты вместить в кадр. По умолчанию — MAX_QUOTE_LINES. */
  maxQuoteLines?: number;
};

/**
 * Вся вёрстка нижнего блока разом.
 *
 * Считается в одном месте, потому что нужна и SVG с текстом, и наложению
 * знака картинкой поверх него: разъедься эти два расчёта — знак сел бы мимо
 * своего места, и заметно это стало бы только на готовом кадре.
 *
 * Блок собирается снизу вверх от нижнего поля: отметка об ИИ, атрибуция,
 * цитата и знак над ней. Знак стоит именно над текстом — снизу он спорил с
 * подписью, а сверху читается как шапка кадра.
 */
export function storyLayout(input: {
  quoteLines: number;
  metaLines: number;
}): {
  logo: { left: number; top: number; width: number; height: number };
  firstLineY: number;
  metaTop: number;
  disclosureBaseline: number;
  scrimTop: number;
} {
  const height = BRAND_LOGO_HEIGHT;
  const width = Math.round(height * BRAND_LOGO_ASPECT);

  const disclosureBaseline = STORY_HEIGHT - BOTTOM_PADDING + 90;
  const metaBottom = disclosureBaseline - 48;
  const metaTop = metaBottom - Math.max(0, input.metaLines - 1) * META_LINE_HEIGHT;
  const quoteBottom =
    input.metaLines > 0 ? metaTop - 58 : disclosureBaseline - 58;
  const firstLineY =
    quoteBottom - Math.max(0, input.quoteLines - 1) * QUOTE_LINE_HEIGHT;
  // Знак поднимается над первой строкой на её кегль плюс воздух.
  const logoTop = firstLineY - QUOTE_SIZE - 28 - height;

  return {
    logo: { left: SIDE_PADDING, top: logoTop, width, height },
    firstLineY,
    metaTop,
    disclosureBaseline,
    // Подложка начинается над знаком, иначе светлый фон съедает и его, и текст.
    scrimTop: Math.max(0, logoTop - 60),
  };
}

/** Где стоит знак. Обёртка над `storyLayout` для наложения картинки. */
export function brandLogoBox(input?: {
  quoteLines: number;
  metaLines: number;
}): { left: number; top: number; width: number; height: number } {
  return storyLayout(input ?? { quoteLines: 1, metaLines: 0 }).logo;
}

export function buildStoryOverlaySvg(input: StoryOverlayInput): string {
  const maxWidth = (STORY_WIDTH - SIDE_PADDING * 2) * WIDTH_SAFETY;
  const lines = clampLines(
    wrapText(input.text, QUOTE_SIZE, maxWidth),
    input.maxQuoteLines ?? MAX_QUOTE_LINES,
  );
  // Атрибуция переносится так же, как цитата: одной строкой длинная связка
  // «автор · произведение · глава» уезжала за правый край.
  const metaLines = input.attribution?.trim()
    ? clampLines(
        wrapText(input.attribution, META_SIZE, maxWidth),
        MAX_META_LINES,
      )
    : [];

  const layout = storyLayout({
    quoteLines: lines.length,
    metaLines: metaLines.length,
  });
  const { firstLineY, metaTop, scrimTop } = layout;

  // Поздравление переносится по тем же правилам, что и цитата: длинное
  // «С днём явления Шри Кришны» иначе выехало бы за край кадра.
  const greetingLines = input.greeting?.trim()
    ? clampLines(
        wrapText(input.greeting, GREETING_SIZE, maxWidth),
        MAX_GREETING_LINES,
      )
    : [];
  const greetingBlock = greetingLines
    .map(
      (line, index) =>
        `<text x="${STORY_WIDTH / 2}" y="${GREETING_TOP + index * GREETING_LINE_HEIGHT}" text-anchor="middle" class="greeting">${escapeXml(line)}</text>`,
    )
    .join('');

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
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0614" stop-opacity="0.68"/>
      <stop offset="70%" stop-color="#0A0614" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#0A0614" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A0614" stop-opacity="0"/>
      <stop offset="45%" stop-color="#0A0614" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#0A0614" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <style>
    .quote { font-family: ${FONT_STACK}; font-size: ${QUOTE_SIZE}px; font-weight: 400; fill: #FFFFFF; }
    .meta  { font-family: ${FONT_STACK}; font-size: ${META_SIZE}px; fill: #D9CCF5; }
    .disclosure { font-family: ${FONT_STACK}; font-size: ${DISCLOSURE_SIZE}px; fill: #B9A9DC; }
    .greeting { font-family: ${FONT_STACK}; font-size: ${GREETING_SIZE}px; font-weight: 700; fill: #FFE2A6; }
  </style>
  ${greetingLines.length > 0 ? `<rect x="0" y="0" width="${STORY_WIDTH}" height="${GREETING_TOP + greetingLines.length * GREETING_LINE_HEIGHT + 60}" fill="url(#topScrim)"/>` : ''}
  <rect x="0" y="${scrimTop}" width="${STORY_WIDTH}" height="${STORY_HEIGHT - scrimTop}" fill="url(#scrim)"/>
  ${greetingBlock}
  ${quoteLines}
  ${attributionLine}
  <text x="${SIDE_PADDING}" y="${layout.disclosureBaseline}" class="disclosure">${escapeXml(AI_DISCLOSURE)}</text>
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
  const maxWidth = (STORY_WIDTH - SIDE_PADDING * 2) * WIDTH_SAFETY;
  const box = brandLogoBox({
    quoteLines: clampLines(
      wrapText(input.text, QUOTE_SIZE, maxWidth),
      input.maxQuoteLines ?? MAX_QUOTE_LINES,
    ).length,
    metaLines: input.attribution?.trim()
      ? clampLines(wrapText(input.attribution, META_SIZE, maxWidth), MAX_META_LINES)
          .length
      : 0,
  });
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
