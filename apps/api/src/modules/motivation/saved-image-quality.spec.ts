import {
  BASE_WIDTH,
  MAX_WIDTH,
  maxWidthFor,
  parseSavedImageQuality,
  qualityCacheTag,
  savedImageEncoding,
  savedImageFileType,
} from './saved-image-quality';

/**
 * VED-156, дописка от 23.09: «Сделай 3 кнопки сохранить изображение в разном
 * качестве, чтобы когда нужно хорошее качество можно было его получить».
 */
describe('parseSavedImageQuality', () => {
  it('без параметра — лёгкий файл, как раньше', () => {
    expect(parseSavedImageQuality(undefined)).toBe('light');
    expect(parseSavedImageQuality('')).toBe('light');
  });

  it('пропускает только белый список', () => {
    expect(parseSavedImageQuality('light')).toBe('light');
    expect(parseSavedImageQuality('standard')).toBe('standard');
    expect(parseSavedImageQuality('max')).toBe('max');
    expect(parseSavedImageQuality('MAX')).toBeNull();
    expect(parseSavedImageQuality('ultra')).toBeNull();
    expect(parseSavedImageQuality(['max', 'light'])).toBeNull();
    expect(parseSavedImageQuality('__proto__')).toBeNull();
  });
});

describe('maxWidthFor', () => {
  it('иллюстрация нейросети 1024×1536 — выше 1080×1920 не растягиваем', () => {
    expect(maxWidthFor('story', { width: 1024, height: 1536 })).toBe(1080);
  });

  it('крупный исходник — до 1440, но не больше, чем он позволяет', () => {
    expect(maxWidthFor('story', { width: 3000, height: 4000 })).toBe(MAX_WIDTH);
    // 1300×2400: по высоте 2400·9/16 = 1350, по ширине 1300 → 1296 (кратно 9).
    expect(maxWidthFor('story', { width: 1300, height: 2400 })).toBe(1296);
  });

  it('ширина сторис кратна 9 — высота ровно 16/9', () => {
    for (const width of [1100, 1234, 1333, 1439]) {
      const result = maxWidthFor('story', { width, height: 5000 });
      expect(result % 9).toBe(0);
      expect(((result / 9) * 16) % 1).toBe(0);
    }
  });

  it('картинка с надписью — по ширине исходника, от 1080 до 1440', () => {
    expect(maxWidthFor('band', { width: 604, height: 604 })).toBe(BASE_WIDTH);
    expect(maxWidthFor('band', { width: 1320, height: 1340 })).toBe(1320);
    expect(maxWidthFor('band', { width: 4000, height: 3000 })).toBe(MAX_WIDTH);
  });
});

describe('savedImageEncoding', () => {
  const generated = { width: 1024, height: 1536 };

  it('лёгкий — ровно прежний файл из #486: JPEG 88, 4:2:0, 1080×1920', () => {
    expect(savedImageEncoding('light', 'story', generated)).toEqual({
      format: 'jpeg',
      width: 1080,
      height: 1920,
      options: { quality: 88, mozjpeg: true, chromaSubsampling: '4:2:0' },
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('стандарт — тот же размер, JPEG 92 без прореживания цвета', () => {
    expect(savedImageEncoding('standard', 'story', generated)).toMatchObject({
      format: 'jpeg',
      width: 1080,
      height: 1920,
      options: { quality: 92, chromaSubsampling: '4:4:4' },
    });
  });

  it('стандарт не зависит от исходника — крупное фото остаётся 1080', () => {
    expect(
      savedImageEncoding('standard', 'story', { width: 4000, height: 6000 }),
    ).toMatchObject({ width: 1080, height: 1920 });
  });

  it('максимум — PNG без потерь, разрешение по исходнику', () => {
    expect(savedImageEncoding('max', 'story', generated)).toMatchObject({
      format: 'png',
      width: 1080,
      height: 1920,
      contentType: 'image/png',
      extension: 'png',
    });
    expect(
      savedImageEncoding('max', 'story', { width: 3000, height: 4000 }),
    ).toMatchObject({ width: 1440, height: 2560 });
  });

  it('у полосы высоту задаёт исходник', () => {
    expect(
      savedImageEncoding('max', 'band', { width: 1320, height: 1340 }),
    ).toMatchObject({ width: 1320, height: null });
  });
});

describe('savedImageFileType и ключ кэша', () => {
  it('тип файла известен до сборки', () => {
    expect(savedImageFileType('light')).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
    expect(savedImageFileType('max')).toEqual({
      contentType: 'image/png',
      extension: 'png',
    });
  });

  it('у каждого качества свой тег, и в тег входит потолок ширины', () => {
    const tags = (['light', 'standard', 'max'] as const).map(qualityCacheTag);
    expect(new Set(tags).size).toBe(3);
    expect(qualityCacheTag('max')).toContain(String(MAX_WIDTH));
  });
});
