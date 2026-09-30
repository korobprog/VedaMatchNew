import sharp from 'sharp';
import {
  MotivationImageThumbService,
  thumbFields,
  webFields,
} from './motivation-image-thumb.service';

function service() {
  const generation = {
    uploadStory: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://cdn.test/${key}`),
      ),
  };
  return {
    thumbs: new MotivationImageThumbService(generation as never),
    generation,
  };
}

describe('MotivationImageThumbService', () => {
  it('кладёт WebP-копию рядом с новой картинкой', async () => {
    const { thumbs, generation } = service();
    const png = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();

    const url = await thumbs.forNewImage('motivation/d/p1/v7.png', png);

    expect(url).toBe('https://cdn.test/motivation/d/p1/v7-w720.webp');
    const [key, bytes, type] = generation.uploadStory.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(key).toBe('motivation/d/p1/v7-w720.webp');
    expect(type).toBe('image/webp');
    expect((await sharp(bytes).metadata()).width).toBe(720);
  });

  it('сбой копии не бросает: null, пост уйдёт без неё', async () => {
    const { thumbs, generation } = service();

    await expect(
      thumbs.forNewImage('motivation/x.png', Buffer.from('not an image')),
    ).resolves.toBeNull();
    expect(generation.uploadStory).not.toHaveBeenCalled();
  });

  it('новая картинка обнуляет историю попыток бэкфилла', () => {
    expect(thumbFields('https://cdn.test/a.webp')).toEqual({
      imageThumbUrl: 'https://cdn.test/a.webp',
      imageThumbAttempts: 0,
      imageThumbAttemptAt: null,
    });
    expect(thumbFields(null).imageThumbUrl).toBeNull();
  });
});

describe('web-копия', () => {
  it('кладёт полноразмерный WebP рядом с оригиналом', async () => {
    const { thumbs, generation } = service();
    const png = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();

    const url = await thumbs.webForNewImage('motivation/d/p1/v7.png', png);

    expect(url).toBe('https://cdn.test/motivation/d/p1/v7-web.webp');
    const [, body, type] = generation.uploadStory.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(type).toBe('image/webp');
    const meta = await sharp(body).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1536]);
  });

  it('сбой копии даёт null, а не исключение', async () => {
    const { thumbs } = service();
    await expect(
      thumbs.webForNewImage('motivation/x.png', Buffer.from('not an image')),
    ).resolves.toBeNull();
  });

  it('webFields обнуляет счётчик попыток', () => {
    expect(webFields('https://cdn.test/a.webp')).toEqual({
      imageWebUrl: 'https://cdn.test/a.webp',
      imageWebAttempts: 0,
      imageWebAttemptAt: null,
    });
  });
});
