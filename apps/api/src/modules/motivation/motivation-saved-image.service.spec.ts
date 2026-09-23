import { NotFoundException } from '@nestjs/common';
import { MotivationSavedImageService } from './motivation-saved-image.service';
import * as savedImage from './saved-image';

const row = {
  id: 'post-1',
  imageUrl: 'https://s3.example/bg.png',
  imageSource: 'generated',
  captionInImage: false,
  storyCaption: true,
  attributionSpeaker: 'Участник VedaMatch',
  attributionWork: 'Бхагавад-гита',
  attributionLocator: '2.27',
  translations: [{ storyText: 'Цитата' }],
  quote: null,
};

function build(overrides: { found?: string | null; upload?: jest.Mock } = {}) {
  const prisma = {
    motivationPost: { findFirst: jest.fn().mockResolvedValue(row) },
  };
  const generation = {
    findUploaded: jest.fn().mockResolvedValue(overrides.found ?? null),
    uploadStory:
      overrides.upload ??
      jest.fn().mockResolvedValue('https://s3.example/saved.jpg'),
  };
  return {
    service: new MotivationSavedImageService(prisma as never, generation as never),
    prisma,
    generation,
  };
}

describe('MotivationSavedImageService', () => {
  const fetchMock = jest.fn();
  let compose: jest.SpyInstance;

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    global.fetch = fetchMock as never;
    compose = jest
      .spyOn(savedImage, 'composeSavedImage')
      .mockResolvedValue(Buffer.from('jpeg'));
  });
  afterEach(() => compose.mockRestore());

  it('готовый файл из хранилища не собирается заново', async () => {
    const { service, generation } = build({ found: 'https://s3.example/cached.jpg' });
    await expect(service.forSlug('slug')).resolves.toEqual({
      kind: 'stored',
      url: 'https://s3.example/cached.jpg',
    });
    expect(compose).not.toHaveBeenCalled();
    expect(generation.uploadStory).not.toHaveBeenCalled();
  });

  it('нет в хранилище — собирает по текущей вёрстке и кладёт JPEG под ключом', async () => {
    const { service, generation } = build();
    await expect(service.forSlug('slug')).resolves.toEqual({
      kind: 'stored',
      url: 'https://s3.example/saved.jpg',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example/bg.png', expect.anything());
    const [, plan] = compose.mock.calls[0];
    expect(plan).toMatchObject({
      kind: 'story',
      text: 'Цитата',
      attribution: 'Участник VedaMatch · Бхагавад-гита · 2.27',
      disclosure: savedImage.SAVED_MARK_AI,
    });
    const [key, , type] = generation.uploadStory.mock.calls[0];
    expect(key).toMatch(/^motivation\/saved\/post-1\/.+\.jpg$/);
    expect(type).toBe('image/jpeg');
  });

  it('одновременные запросы одного поста собирают файл один раз', async () => {
    const { service } = build();
    await Promise.all([service.forSlug('slug'), service.forSlug('slug')]);
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it('хранилище недоступно — отдаёт собранные байты, а не ошибку', async () => {
    const { service } = build({
      upload: jest.fn().mockRejectedValue(new Error('S3 is not configured')),
    });
    await expect(service.forSlug('slug')).resolves.toEqual({
      kind: 'bytes',
      bytes: Buffer.from('jpeg'),
    });
  });

  it('неопубликованный или чужой слаг — 404', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue(null);
    await expect(service.forSlug('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
