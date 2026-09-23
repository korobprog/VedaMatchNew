import { BLOG_IMAGE_MAX_BYTES, BLOG_POST_MAX_IMAGES, BLOG_POST_TEXT_MAX_LENGTH, BLOG_POST_TITLE_MAX_LENGTH } from '@vedamatch/shared';
import {
  EMPTY_BLOG_DRAFT,
  addBlogPhotos,
  blogDraftFields,
  blogPhotoDenialMessage,
  blogTextCounter,
  normalizeBlogPhoto,
  normalizeBlogText,
  normalizeBlogTitle,
  remainingPhotoSlots,
  removeBlogPhoto,
  takeBlogAssets,
  validateBlogDraft,
  type BlogDraft,
  type BlogPhoto,
} from './blog-draft';

function photo(key: string): BlogPhoto {
  return { key, uri: `file:///${key}.jpg`, name: `${key}.jpg`, type: 'image/jpeg', sizeBytes: 1000 };
}

function draft(overrides: Partial<BlogDraft> = {}): BlogDraft {
  return { ...EMPTY_BLOG_DRAFT, ...overrides };
}

describe('проверка перед публикацией', () => {
  it('пустой пост не уходит: это пустая карточка в общей ленте', () => {
    expect(validateBlogDraft(draft())).toBe('post_empty');
    expect(validateBlogDraft(draft({ title: '   ', text: '\n\n  \n' }))).toBe('post_empty');
  });

  it('одна фотография без слов — законный пост картиночной ленты', () => {
    expect(validateBlogDraft(draft({ photos: [photo('a')] }))).toBeNull();
  });

  it('одного заголовка или одного текста достаточно', () => {
    expect(validateBlogDraft(draft({ title: 'Киртан' }))).toBeNull();
    expect(validateBlogDraft(draft({ text: 'Харе Кришна' }))).toBeNull();
  });

  it('пределы — те же, что у сервера, ровно на границе проходит', () => {
    expect(validateBlogDraft(draft({ title: 'з'.repeat(BLOG_POST_TITLE_MAX_LENGTH) }))).toBeNull();
    expect(validateBlogDraft(draft({ title: 'з'.repeat(BLOG_POST_TITLE_MAX_LENGTH + 1) }))).toBe('title_too_long');
    expect(validateBlogDraft(draft({ text: 'т'.repeat(BLOG_POST_TEXT_MAX_LENGTH) }))).toBeNull();
    expect(validateBlogDraft(draft({ text: 'т'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 1) }))).toBe('text_too_long');
  });

  it('пробелы по краям в предел не считаются — сервер их отрежет', () => {
    expect(validateBlogDraft(draft({ text: `  ${'т'.repeat(BLOG_POST_TEXT_MAX_LENGTH)}  ` }))).toBeNull();
  });

  it('больше десяти фотографий — отказ', () => {
    const photos = Array.from({ length: BLOG_POST_MAX_IMAGES + 1 }, (_, index) => photo(`p${index}`));
    expect(validateBlogDraft(draft({ text: 'x', photos }))).toBe('too_many_images');
  });

  it('первая ошибка — в порядке полей формы: заголовок раньше текста', () => {
    const both = draft({
      title: 'з'.repeat(BLOG_POST_TITLE_MAX_LENGTH + 1),
      text: 'т'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 1),
    });
    expect(validateBlogDraft(both)).toBe('title_too_long');
  });
});

describe('нормализация — как у сервера', () => {
  it('заголовок из пробелов — «без заголовка»', () => {
    expect(normalizeBlogTitle('   ')).toBeNull();
    expect(normalizeBlogTitle('  Киртан ')).toBe('Киртан');
  });

  it('текст: CRLF, строки из пробелов, три перевода подряд, края', () => {
    expect(normalizeBlogText('  А\r\n \t\r\n\r\n\r\nБ  ')).toBe('А\n\nБ');
    expect(normalizeBlogText('А\n\nБ')).toBe('А\n\nБ');
  });

  it('поля запроса уже нормализованы', () => {
    expect(blogDraftFields(draft({ title: '  ', text: ' Слова ' }))).toEqual({ title: null, text: 'Слова' });
  });
});

describe('фотографии', () => {
  it('JPEG, PNG и WebP принимаются, имя своё и по порядку', () => {
    const result = normalizeBlogPhoto({ uri: 'file:///x/ImagePicker-1.jpg', mimeType: 'image/jpeg', fileSize: 500 }, 2, 7);
    expect(result).toEqual({
      uri: 'file:///x/ImagePicker-1.jpg',
      name: 'photo-3.jpg',
      type: 'image/jpeg',
      sizeBytes: 500,
      key: '7-2-file:///x/ImagePicker-1.jpg',
    });
    expect(normalizeBlogPhoto({ uri: 'file:///a.png', mimeType: 'image/png' }, 0)).toMatchObject({ name: 'photo-1.png' });
    expect(normalizeBlogPhoto({ uri: 'file:///a.webp' }, 0)).toMatchObject({ type: 'image/webp' });
  });

  it('GIF и HEIC сервер блога не примет — отказ сразу, а не после загрузки', () => {
    expect(normalizeBlogPhoto({ uri: 'file:///a.gif' }, 0)).toBe('unsupported_type');
    expect(normalizeBlogPhoto({ uri: 'file:///a.heic' }, 0)).toBe('unsupported_type');
  });

  it('тип не определить — отдельный отказ', () => {
    expect(normalizeBlogPhoto({ uri: 'content://media/42' }, 0)).toBe('unknown_type');
  });

  it('больше 10 МБ — отказ; размер неизвестен — решает сервер', () => {
    expect(normalizeBlogPhoto({ uri: 'file:///a.jpg', fileSize: BLOG_IMAGE_MAX_BYTES + 1 }, 0)).toBe('file_too_large');
    expect(normalizeBlogPhoto({ uri: 'file:///a.jpg', fileSize: BLOG_IMAGE_MAX_BYTES }, 0)).toMatchObject({ type: 'image/jpeg' });
    expect(normalizeBlogPhoto({ uri: 'file:///a.jpg', fileSize: null }, 0)).toMatchObject({ sizeBytes: 0 });
  });

  it('выбор галереи: годные — в черновик, отказы — одной фразой', () => {
    const { photos, denial } = takeBlogAssets(
      [{ uri: 'file:///1.jpg' }, { uri: 'file:///2.gif' }, { uri: 'file:///3.gif' }, { uri: 'file:///4.png' }],
      1,
      5,
    );
    expect(photos.map((item) => item.name)).toEqual(['photo-2.jpg', 'photo-5.png']);
    expect(denial).toBe('2 фотографии не подошли: нужен JPEG, PNG или WebP.');
    expect(takeBlogAssets([{ uri: 'file:///1.jpg' }], 0).denial).toBeNull();
  });

  it('тексты отказов', () => {
    expect(blogPhotoDenialMessage('file_too_large')).toBe('Фотография не подошла: больше 10 МБ.');
    expect(blogPhotoDenialMessage('unknown_type')).toBe('Фотография не подошла: не удалось определить тип файла.');
    expect(blogPhotoDenialMessage('unsupported_type', 5)).toBe('5 фотографий не подошли: нужен JPEG, PNG или WebP.');
  });

  it('сверх десяти не добавляется, и сколько не влезло — известно', () => {
    const full = draft({ photos: Array.from({ length: 8 }, (_, index) => photo(`p${index}`)) });
    expect(remainingPhotoSlots(full)).toBe(2);
    const { draft: next, dropped } = addBlogPhotos(full, [photo('a'), photo('b'), photo('c')]);
    expect(next.photos).toHaveLength(BLOG_POST_MAX_IMAGES);
    expect(dropped).toBe(1);
    expect(remainingPhotoSlots(next)).toBe(0);
  });

  it('убрать фотографию — по ключу, остальные на месте', () => {
    const next = removeBlogPhoto(draft({ photos: [photo('a'), photo('b'), photo('c')] }), 'b');
    expect(next.photos.map((item) => item.key)).toEqual(['a', 'c']);
  });
});

describe('счётчик текста', () => {
  it('спокойно — «N из 20000»', () => {
    expect(blogTextCounter('Харе Кришна')).toEqual({ label: `11 из ${BLOG_POST_TEXT_MAX_LENGTH}`, tone: 'quiet' });
  });

  it('за тысячу до предела — предупреждение', () => {
    expect(blogTextCounter('т'.repeat(BLOG_POST_TEXT_MAX_LENGTH - 1000))).toEqual({ label: 'Осталось 1000 знаков.', tone: 'warn' });
    expect(blogTextCounter('т'.repeat(BLOG_POST_TEXT_MAX_LENGTH - 1)).label).toBe('Осталось 1 знак.');
  });

  it('перебор — сколько убрать, а не молчаливая обрезка', () => {
    expect(blogTextCounter('т'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 1))).toEqual({
      label: 'Лишний 1 знак — столько нужно убрать.',
      tone: 'over',
    });
    expect(blogTextCounter('т'.repeat(BLOG_POST_TEXT_MAX_LENGTH + 3)).label).toBe('Лишних 3 знака — столько нужно убрать.');
  });
});
