import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationPostcardsService } from './motivation-postcards.service';

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

function build() {
  const prisma = {
    motivationEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({
        id: 'event-1',
        date: new Date('2026-09-05T00:00:00.000Z'),
        title: 'Джанмаштами',
        greeting: null,
        leadDays: 3,
        enabled: true,
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    motivationPost: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const generation = {
    uploadStory: jest.fn().mockResolvedValue('https://cdn/postcard.png'),
  };
  return {
    service: new MotivationPostcardsService(
      prisma as never,
      generation as never,
    ),
    prisma,
    generation,
  };
}

describe('MotivationPostcardsService admin gate', () => {
  it('allows an admin to list, create and remove events', async () => {
    const { service, prisma } = build();

    await expect(service.list(admin)).resolves.toEqual([]);
    await expect(
      service.create(admin, { title: 'Джанмаштами', date: '2026-09-05' }),
    ).resolves.toMatchObject({ title: 'Джанмаштами', date: '2026-09-05' });
    await expect(service.remove(admin, 'event-1')).resolves.toBeUndefined();
    expect(prisma.motivationEvent.delete).toHaveBeenCalledWith({
      where: { id: 'event-1' },
    });
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service } = build();

    await expect(service.list(motivationServiceAdmin)).resolves.toEqual([]);
    await expect(
      service.create(motivationServiceAdmin, {
        title: 'Джанмаштами',
        date: '2026-09-05',
      }),
    ).resolves.toMatchObject({ title: 'Джанмаштами', date: '2026-09-05' });
    await expect(
      service.remove(motivationServiceAdmin, 'event-1'),
    ).resolves.toBeUndefined();
  });

  it('rejects a regular user', async () => {
    const { service } = build();

    await expect(service.list(regularUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create(regularUser, { title: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(regularUser, 'event-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service, prisma } = build();

    await expect(service.list(otherServiceAdmin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create(otherServiceAdmin, { title: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove(otherServiceAdmin, 'event-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.motivationEvent.delete).not.toHaveBeenCalled();
  });
});

describe('MotivationPostcardsService.build', () => {
  const publishedOwnPost = {
    id: 'post-1',
    imageUrl: 'https://cdn/post.png',
    status: 'published',
    authorUserId: 'user-1',
    origin: 'user',
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
    translations: [{ storyText: 'Цитата', text: 'Цитата' }],
  };

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function stubImageDownload() {
    // Настоящий PNG: composeStoryImage гоняет байты через sharp, заглушка не
    // подойдёт.
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

  it('lets the author build a postcard from their own published reel', async () => {
    stubImageDownload();
    const { service, prisma } = build();
    prisma.motivationPost.findUnique.mockResolvedValue(publishedOwnPost);
    prisma.motivationEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        title: 'Джанмаштами',
        greeting: 'С праздником!',
        leadDays: 30,
        enabled: true,
      },
    ]);

    await expect(
      service.build('user-1', regularUser, 'post-1'),
    ).resolves.toMatchObject({ url: 'https://cdn/postcard.png' });
  });

  it("refuses to build a postcard from someone else's reel for a regular user", async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findUnique.mockResolvedValue({
      ...publishedOwnPost,
      authorUserId: 'someone-else',
    });

    await expect(
      service.build('user-1', regularUser, 'post-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an admin build a postcard from someone else's reel", async () => {
    stubImageDownload();
    const { service, prisma } = build();
    prisma.motivationPost.findUnique.mockResolvedValue({
      ...publishedOwnPost,
      authorUserId: 'someone-else',
    });
    prisma.motivationEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        date: new Date('2026-09-01T00:00:00.000Z'),
        title: 'Джанмаштами',
        greeting: 'С праздником!',
        leadDays: 30,
        enabled: true,
      },
    ]);

    await expect(
      service.build('admin-1', admin, 'post-1'),
    ).resolves.toMatchObject({ url: 'https://cdn/postcard.png' });
  });

  it('does not let a service-admin of another service bypass the ownership check', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findUnique.mockResolvedValue({
      ...publishedOwnPost,
      authorUserId: 'someone-else',
    });

    await expect(
      service.build('user-2', otherServiceAdmin, 'post-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
