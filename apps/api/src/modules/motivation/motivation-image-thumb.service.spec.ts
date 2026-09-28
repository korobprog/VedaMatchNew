import sharp from 'sharp';
import {
  MotivationImageThumbService,
  thumbFields,
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
