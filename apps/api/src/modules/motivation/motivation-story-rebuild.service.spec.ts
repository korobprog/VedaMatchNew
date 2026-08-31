import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationStoryRebuildService } from './motivation-story-rebuild.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

/** Пост со свежей сторис: оформление старое, но файл отдельный и не пустой. */
const withStory = {
  id: 'p1',
  slug: 'post',
  contentDate: new Date('2026-08-18T00:00:00.000Z'),
  imageUrl: 'https://cdn/pic.png',
  storyImageUrl: 'https://cdn/pic-story.png',
  storyCaption: true,
  attributionSpeaker: null,
  attributionWork: null,
  attributionLocator: null,
  translations: [{ storyText: 'Цитата' }],
  quote: null,
};

/** Пост из времён до подписи: сторис — байт в байт копия картинки. */
const legacy = {
  ...withStory,
  id: 'p2',
  slug: 'legacy',
  storyImageUrl: 'https://cdn/pic.png',
};

function build(posts: unknown[]) {
  const prisma = {
    motivationPost: {
      findMany: jest.fn(async () => posts),
      update: jest.fn(async () => ({})),
    },
  } as unknown as PrismaService;
  const generation = {
    uploadStory: jest.fn(async () => 'https://cdn/new-story.png'),
  } as unknown as MotivationGenerationService;
  return {
    service: new MotivationStoryRebuildService(prisma, generation),
    generation,
  };
}

describe('MotivationStoryRebuildService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function stubImageDownload() {
    // Настоящий PNG: сервис гоняет байты через sharp, заглушка не подойдёт.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(png).buffer,
    })) as unknown as typeof fetch;
  }

  it('без force берёт только посты из времён до подписи', async () => {
    stubImageDownload();
    const { service, generation } = build([withStory, legacy]);

    const result = await service.rebuild(admin, 20);

    expect(result.rebuilt).toBe(1);
    expect(generation.uploadStory).toHaveBeenCalledTimes(1);
  });

  it('force пересобирает и те, у кого сторис уже есть', async () => {
    // Нужно при смене оформления: знак и отметка об ИИ появились, а платить
    // за повторную генерацию картинки ради нового слоя незачем.
    stubImageDownload();
    const { service, generation } = build([withStory, legacy]);

    const result = await service.rebuild(admin, 20, true);

    expect(result.rebuilt).toBe(2);
    expect(generation.uploadStory).toHaveBeenCalledTimes(2);
  });

  it('не пускает никого, кроме администратора', async () => {
    const { service } = build([legacy]);

    await expect(service.rebuild(regularUser, 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('пускает service-admin, которому выдан сервис motivation', async () => {
    stubImageDownload();
    const { service } = build([legacy]);

    await expect(
      service.rebuild(motivationServiceAdmin, 20),
    ).resolves.toMatchObject({ rebuilt: 1 });
  });

  it('не пускает service-admin другого сервиса', async () => {
    const { service } = build([legacy]);

    await expect(service.rebuild(otherServiceAdmin, 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
