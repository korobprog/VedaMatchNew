import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { BRAND_LOGO_ASPECT, brandLogoBuffer } from './story-brand';
import { escapeXml, frameStoryImage } from './story-image';

/**
 * Файл, который человек сохраняет или отдаёт в приложение с экрана
 * «Поделиться» (VED-227, VED-247, VED-156).
 *
 * Раньше отдавался хранимый кадр сторис (`storyImageUrl`). Он собирается один
 * раз, когда пост создан, и дальше не меняется, — поэтому правки подписи
 * доходили только до новых постов. Заказчик сохранял афоризм недельной
 * давности и видел старую раскладку: знак над подписью, без «Скачано с
 * VedaMatch.ru». К тому же это PNG на 4–5 МБ: на мобильной сети «Отправить в
 * приложение» ждало его по десять секунд.
 *
 * Теперь файл собирается по текущей вёрстке из исходной иллюстрации и
 * кэшируется в хранилище под ключом, в который входит всё, от чего зависит
 * картинка. Поменялась вёрстка — меняется `SAVED_IMAGE_VERSION`, и старые
 * файлы просто перестают находиться. Сам кадр сторис в ленте не трогается:
 * «на основном отображении ничего менять не надо».
 */

/** Поднимать при любой правке вёрстки сохраняемого файла. */
export const SAVED_IMAGE_VERSION = 's1';

/** Отметка происхождения (VED-247) — на каждом сохранённом файле. */
export const SAVED_MARK = 'Скачано с VedaMatch.ru';

/**
 * Для кадров, нарисованных нейросетью: к отметке происхождения добавляется
 * маркировка ИИ-контента — у неё юридический вес (см. `AI_DISCLOSURE` в
 * story-image.ts).
 */
export const SAVED_MARK_AI = `${SAVED_MARK} · Создано нейросетью`;

export interface SavedImageSource {
  id: string;
  imageUrl: string | null;
  imageSource: 'generated' | 'uploaded';
  /** Готовая картинка с надписью (VED-87): текст уже на пикселях. */
  captionInImage: boolean;
  /** Накладывать ли цитату на кадр — выбор автора поста. */
  storyCaption: boolean;
  /** Короткий текст для сторис из перевода, если он есть. */
  storyText: string | null;
  /** Исходный текст цитаты — запасной вариант, как у воркера. */
  quoteText: string | null;
  /** Готовая строка «автор · произведение · глава». */
  attribution: string;
}

export type SavedImagePlan =
  | {
      /** Кадр 9:16 с цитатой, знаком и подписью — как сторис. */
      kind: 'story';
      background: string;
      text: string;
      attribution: string;
      disclosure: string;
      aiGenerated: boolean;
    }
  | {
      /**
       * Готовая картинка с надписью: поверх неё ничего не кладём — надпись
       * идёт до краёв, и знак сел бы на буквы. Полоса со знаком
       * пристраивается снизу.
       */
      kind: 'band';
      background: string;
      disclosure: string;
      aiGenerated: false;
    };

/**
 * Что будет на сохраняемом файле. `null` — картинки у поста нет.
 *
 * Отметка об ИИ ставится только на сгенерированные кадры: на фото, которое
 * человек загрузил сам, «Создано нейросетью» было бы неправдой.
 */
export function savedImagePlan(post: SavedImageSource): SavedImagePlan | null {
  if (!post.imageUrl) return null;
  if (post.captionInImage)
    return {
      kind: 'band',
      background: post.imageUrl,
      disclosure: SAVED_MARK,
      aiGenerated: false,
    };
  const aiGenerated = post.imageSource === 'generated';
  const text = post.storyCaption
    ? post.storyText?.trim() || post.quoteText?.trim() || ''
    : '';
  return {
    kind: 'story',
    background: post.imageUrl,
    text,
    // Подпись без цитаты повисла бы в воздухе: автор выключил текст на кадре
    // — остаются знак и отметка происхождения.
    attribution: text ? post.attribution.trim() : '',
    disclosure: aiGenerated ? SAVED_MARK_AI : SAVED_MARK,
    aiGenerated,
  };
}

/**
 * Ключ файла в хранилище. Хэш от всего, что попадает на пиксели: поправили
 * цитату, заменили картинку или сменили вёрстку — ключ другой, и файл
 * собирается заново. Старые ключи никто не удаляет: их немного, а удалять
 * файл, по которому кто-то может прямо сейчас качать, незачем.
 */
export function savedImageKey(postId: string, plan: SavedImagePlan): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ version: SAVED_IMAGE_VERSION, ...plan }))
    .digest('hex')
    .slice(0, 16);
  return `motivation/saved/${postId}/${SAVED_IMAGE_VERSION}-${hash}.jpg`;
}

/**
 * JPEG, а не PNG: истории и статусы его принимают все, а весит он вдесятеро
 * меньше — 300–600 КБ вместо 4–5 МБ, это и есть «кнопка тупит» из VED-156.
 * Качество 88 с mozjpeg: на тексте цитаты не видно ряби.
 */
const JPEG_QUALITY = 88;

async function toJpeg(image: Buffer, aiGenerated: boolean): Promise<Buffer> {
  return sharp(image)
    .flatten({ background: '#0A0614' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .withExif({
      IFD0: {
        Software: 'VedaMatch',
        // Та же маркировка, что на пикселях, — для автоматики площадок.
        // EXIF-строка по стандарту ASCII, поэтому по-английски.
        ...(aiGenerated
          ? { ImageDescription: 'AI-generated image, VedaMatch.ru' }
          : { ImageDescription: 'VedaMatch.ru' }),
      },
    })
    .toBuffer();
}

/** Сохраняемый файл-сторис: кадр 1080×1920 по текущей вёрстке. */
export async function composeSavedStory(
  background: Buffer,
  plan: Extract<SavedImagePlan, { kind: 'story' }>,
): Promise<Buffer> {
  const framed = await frameStoryImage(background, {
    text: plan.text,
    attribution: plan.attribution,
    disclosure: plan.disclosure,
  });
  return toJpeg(framed, plan.aiGenerated);
}

/** Ширина файла с полосой: как у сторис, чтобы знак был того же размера. */
export const BAND_WIDTH = 1080;
const BAND_HEIGHT = 136;
const BAND_PADDING = 48;
const BAND_LOGO_HEIGHT = 80;
/** Тот же воздух между знаком и надписью, что и в строке сторис (VED-227). */
const BAND_GAP = 48;
const BAND_TEXT_SIZE = 32;

/**
 * Геометрия полосы: где знак и где надпись. Отдельно от отрисовки — чтобы
 * тест проверял расстановку числами, а не пикселями.
 */
export function bandLayout(imageHeight: number): {
  height: number;
  logo: { left: number; top: number; width: number; height: number };
  textX: number;
  textBaseline: number;
} {
  const logoWidth = Math.round(BAND_LOGO_HEIGHT * BRAND_LOGO_ASPECT);
  const logoTop =
    imageHeight + Math.round((BAND_HEIGHT - BAND_LOGO_HEIGHT) / 2);
  return {
    height: imageHeight + BAND_HEIGHT,
    logo: {
      left: BAND_PADDING,
      top: logoTop,
      width: logoWidth,
      height: BAND_LOGO_HEIGHT,
    },
    textX: BAND_PADDING + logoWidth + BAND_GAP,
    // Середина заглавных — на середине полосы, как у строки сторис.
    textBaseline:
      imageHeight + Math.round(BAND_HEIGHT / 2 + (BAND_TEXT_SIZE * 0.72) / 2),
  };
}

/**
 * Готовая картинка с надписью плюс тёмная полоса снизу: знак VedaMatch слева,
 * «Скачано с VedaMatch.ru» справа от него на одном уровне (VED-247).
 */
export async function composeSavedBand(
  background: Buffer,
  plan: Extract<SavedImagePlan, { kind: 'band' }>,
): Promise<Buffer> {
  const image = await sharp(background, { failOn: 'error' })
    .rotate()
    .resize({ width: BAND_WIDTH })
    .png()
    .toBuffer();
  const { height: imageHeight = 0 } = await sharp(image).metadata();
  const layout = bandLayout(imageHeight);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BAND_WIDTH}" height="${layout.height}">
  <rect x="0" y="${imageHeight}" width="${BAND_WIDTH}" height="${layout.height - imageHeight}" fill="#0A0614"/>
  <text x="${layout.textX}" y="${layout.textBaseline}" font-family="'Noto Sans','DejaVu Sans',sans-serif" font-size="${BAND_TEXT_SIZE}" fill="#D9CCF5">${escapeXml(plan.disclosure)}</text>
</svg>`;
  const logo = await sharp(brandLogoBuffer())
    .resize(layout.logo.width, layout.logo.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const composed = await sharp(Buffer.from(svg))
    .composite([
      { input: image, left: 0, top: 0 },
      { input: logo, left: layout.logo.left, top: layout.logo.top },
    ])
    .png()
    .toBuffer();
  return toJpeg(composed, false);
}

/** Собрать файл по плану. */
export function composeSavedImage(
  background: Buffer,
  plan: SavedImagePlan,
): Promise<Buffer> {
  return plan.kind === 'band'
    ? composeSavedBand(background, plan)
    : composeSavedStory(background, plan);
}
