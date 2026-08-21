import { buildFalImageRequest, parseFalImageUrl } from './fal-image-request';

describe('buildFalImageRequest', () => {
  it('передаёт размер числами, а не пресетом', () => {
    expect(buildFalImageRequest({ prompt: 'храм', size: '1024x1536' })).toEqual(
      {
        prompt: 'храм',
        image_size: { width: 1024, height: 1536 },
      },
    );
  });

  it('не шлёт размер, если разобрать его не вышло', () => {
    // Лишнее или битое поле уходит в платный запрос — лучше отдать модели
    // её собственный дефолт, чем мусор.
    expect(buildFalImageRequest({ prompt: 'храм', size: 'большой' })).toEqual({
      prompt: 'храм',
    });
    expect(buildFalImageRequest({ prompt: 'храм', size: '0x1536' })).toEqual({
      prompt: 'храм',
    });
  });
});

describe('parseFalImageUrl', () => {
  it('читает обычный ответ со списком картинок', () => {
    expect(
      parseFalImageUrl({ images: [{ url: 'https://fal.media/a.png' }] }),
    ).toBe('https://fal.media/a.png');
  });

  it('читает модели с одиночной картинкой', () => {
    expect(
      parseFalImageUrl({ image: { url: 'https://fal.media/b.png' } }),
    ).toBe('https://fal.media/b.png');
  });

  it('берёт первую из нескольких', () => {
    expect(
      parseFalImageUrl({
        images: [
          { url: 'https://fal.media/1.png' },
          { url: 'https://fal.media/2.png' },
        ],
      }),
    ).toBe('https://fal.media/1.png');
  });

  it.each([
    ['пустой список', { images: [] }],
    ['ответ без картинок', { detail: 'nope' }],
    ['не-строку в url', { images: [{ url: 42 }] }],
    ['не-http ссылку', { images: [{ url: 'javascript:alert(1)' }] }],
    ['не объект', 'https://fal.media/a.png'],
    ['null', null],
  ])('отдаёт null на %s', (_name, payload) => {
    expect(parseFalImageUrl(payload)).toBeNull();
  });
});
