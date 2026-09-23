import sharp from 'sharp';
import {
  BAND_WIDTH,
  bandLayout,
  composeSavedBand,
  composeSavedStory,
  SAVED_IMAGE_VERSION,
  SAVED_MARK,
  SAVED_MARK_AI,
  savedImageKey,
  savedImagePlan,
  type SavedImagePlan,
  type SavedImageSource,
} from './saved-image';
import { STORY_HEIGHT, STORY_WIDTH } from './story-image';

const base: SavedImageSource = {
  id: 'post-1',
  imageUrl: 'https://s3.example/motivation/2026-09-15/post-1/v1.png',
  imageSource: 'generated',
  captionInImage: false,
  storyCaption: true,
  storyText: 'Тот, кто родился, непременно умрёт.',
  quoteText: 'Исходный текст',
  attribution: 'Участник VedaMatch · Бхагавад-гита 2.27',
};

describe('savedImagePlan', () => {
  it('сгенерированный кадр: сторис с цитатой, «Скачано с VedaMatch.ru» и ИИ-меткой (VED-247)', () => {
    expect(savedImagePlan(base)).toEqual({
      kind: 'story',
      background: base.imageUrl,
      text: base.storyText,
      attribution: base.attribution,
      disclosure: SAVED_MARK_AI,
      aiGenerated: true,
    });
    expect(SAVED_MARK_AI).toContain('Скачано с VedaMatch.ru');
    expect(SAVED_MARK_AI).toContain('Создано нейросетью');
  });

  it('загруженное фото: отметка происхождения без ИИ-метки — было бы неправдой', () => {
    const plan = savedImagePlan({ ...base, imageSource: 'uploaded' });
    expect(plan).toMatchObject({ kind: 'story', disclosure: SAVED_MARK, aiGenerated: false });
  });

  it('готовая картинка с надписью: полоса снизу, поверх ничего не кладём', () => {
    expect(savedImagePlan({ ...base, captionInImage: true, storyCaption: false })).toEqual({
      kind: 'band',
      background: base.imageUrl,
      disclosure: SAVED_MARK,
      aiGenerated: false,
    });
  });

  it('текст берётся как у воркера: перевод для сторис, иначе исходная цитата', () => {
    expect(savedImagePlan({ ...base, storyText: '  ' })).toMatchObject({ text: 'Исходный текст' });
    expect(savedImagePlan({ ...base, storyText: null, quoteText: null })).toMatchObject({
      text: '',
      attribution: '',
    });
  });

  it('подпись на кадре выключена автором — только знак и отметка', () => {
    expect(savedImagePlan({ ...base, storyCaption: false })).toMatchObject({
      kind: 'story',
      text: '',
      attribution: '',
      disclosure: SAVED_MARK_AI,
    });
  });

  it('без картинки файла нет', () => {
    expect(savedImagePlan({ ...base, imageUrl: null })).toBeNull();
  });
});

describe('savedImageKey', () => {
  const plan = savedImagePlan(base)!;

  it('стабилен для того же содержимого и несёт версию вёрстки', () => {
    const key = savedImageKey('post-1', plan);
    expect(key).toBe(savedImageKey('post-1', { ...plan }));
    expect(key).toMatch(
      new RegExp(`^motivation/saved/post-1/${SAVED_IMAGE_VERSION}-[0-9a-f]{16}\\.jpg$`),
    );
  });

  it('меняется, когда меняется то, что на пикселях', () => {
    const key = savedImageKey('post-1', plan);
    const edited: SavedImagePlan = { ...plan, text: 'Другая цитата' } as SavedImagePlan;
    expect(savedImageKey('post-1', edited)).not.toBe(key);
    expect(
      savedImageKey('post-1', { ...plan, background: 'https://s3.example/other.png' }),
    ).not.toBe(key);
  });
});

describe('bandLayout', () => {
  it('знак слева, надпись справа от него на одном уровне и с воздухом', () => {
    const layout = bandLayout(1350);
    const { logo } = layout;
    expect(logo.top).toBeGreaterThan(1350);
    expect(logo.top + logo.height).toBeLessThan(layout.height);
    expect(layout.textX - (logo.left + logo.width)).toBeGreaterThanOrEqual(44);
    // Базовая линия — в пределах высоты знака.
    expect(layout.textBaseline).toBeGreaterThan(logo.top);
    expect(layout.textBaseline).toBeLessThan(logo.top + logo.height);
  });
});

describe('сборка файла', () => {
  // Шумный фон ближе к настоящей иллюстрации, чем заливка: на заливке любой
  // формат сожмётся в ничто, и проверка веса ничего бы не сказала.
  const noisy = (width: number, height: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 90, g: 70, b: 120 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();

  it('сторис — JPEG 1080×1920, заметно легче PNG-кадра (VED-156)', async () => {
    const plan = savedImagePlan(base) as Extract<SavedImagePlan, { kind: 'story' }>;
    const jpeg = await composeSavedStory(await noisy(1024, 1536), plan);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(STORY_WIDTH);
    expect(meta.height).toBe(STORY_HEIGHT);
    expect(jpeg.length).toBeLessThan(2_000_000);
  });

  it('готовая картинка — ширина 1080, снизу пристроена полоса', async () => {
    const plan = savedImagePlan({ ...base, captionInImage: true }) as Extract<
      SavedImagePlan,
      { kind: 'band' }
    >;
    const jpeg = await composeSavedBand(await noisy(800, 1000), plan);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(BAND_WIDTH);
    expect(meta.height).toBe(bandLayout(1350).height);

    // В полосе знак белый на тёмном — светлые точки есть только от него.
    const { logo } = bandLayout(1350);
    const { data, info } = await sharp(jpeg)
      .extract({ left: logo.left, top: logo.top, width: logo.width, height: logo.height })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bright = 0;
    for (let i = 0; i < data.length; i += info.channels)
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright++;
    expect(bright).toBeGreaterThan(50);
  });
});
