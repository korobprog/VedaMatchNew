/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangelogService } from './changelog.service';

describe('ChangelogService', () => {
  const prisma = {
    release: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    releaseChange: {
      deleteMany: jest.fn(),
    },
    announcement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    roadmapItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // Рассылка уходит событиями на шину: сервисный модуль не вправе дёргать
  // уведомления напрямую.
  const events = { emit: jest.fn() };
  const service = new ChangelogService(
    prisma as unknown as PrismaService,
    events as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('admin role guard', () => {
    it('rejects release creation for a non-admin', async () => {
      await expect(
        service.adminCreateRelease('user', {
          version: '1.0.0',
          releasedAt: '2026-01-01',
          changes: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.release.create).not.toHaveBeenCalled();
    });

    it('rejects roadmap listing for a non-admin', async () => {
      await expect(service.adminListRoadmap('user')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('adminCreateRelease', () => {
    it('creates a release with ordered changes for an admin', async () => {
      prisma.release.create.mockResolvedValue({
        id: 'r1',
        version: '1.4.0',
        isCurrent: false,
        releasedAt: new Date('2026-08-01'),
        changes: [
          {
            id: 'c1',
            type: 'feature',
            titleRu: 'Новая страница версий',
            titleEn: 'New updates page',
            sortOrder: 0,
          },
        ],
      });

      const result = await service.adminCreateRelease('admin', {
        version: '1.4.0',
        releasedAt: '2026-08-01',
        changes: [
          {
            type: 'feature',
            titleRu: 'Новая страница версий',
            titleEn: 'New updates page',
          },
        ],
      });

      expect(result.version).toBe('1.4.0');
      expect(result.changes).toHaveLength(1);
      expect(prisma.release.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: '1.4.0' }),
        }),
      );
    });
  });

  describe('adminSetCurrentRelease', () => {
    it('throws when the release does not exist', async () => {
      prisma.release.findUnique.mockResolvedValue(null);

      await expect(
        service.adminSetCurrentRelease('admin', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('unsets the previous current release and sets the new one in a transaction', async () => {
      prisma.release.findUnique.mockResolvedValue({ id: 'r2' });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await service.adminSetCurrentRelease('admin', 'r2');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [transactionArg] = prisma.$transaction.mock.calls[0] as [unknown[]];
      expect(transactionArg).toHaveLength(2);
    });
  });

  describe('listReleases', () => {
    it('localizes change titles to the requested language', async () => {
      prisma.release.findMany.mockResolvedValue([
        {
          id: 'r1',
          version: '1.0.0',
          isCurrent: true,
          releasedAt: new Date('2026-01-01'),
          changes: [
            {
              id: 'c1',
              type: 'improvement',
              titleRu: 'Улучшение',
              titleEn: 'Improvement',
              sortOrder: 0,
            },
          ],
        },
      ]);

      const [ru, en] = await Promise.all([
        service.listReleases('ru'),
        service.listReleases('en'),
      ]);

      expect(ru[0].changes[0].title).toBe('Улучшение');
      expect(en[0].changes[0].title).toBe('Improvement');
    });
  });
});

describe('ChangelogService: рассылка новости', () => {
  function build() {
    const prisma = {
      announcement: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
    };
    const events = { emit: jest.fn() };
    return {
      prisma,
      events,
      service: new ChangelogService(
        prisma as unknown as PrismaService,
        events as never,
        {} as never,
      ),
    };
  }

  const published = {
    id: 'a1',
    status: 'published',
    publishAt: null,
    expiresAt: null,
    titleRu: 'Открыли Студию',
    bodyRu: 'Теперь свои рилсы живут в отдельном разделе',
  };

  it('шлёт событие каждому получателю и считает адресатов', async () => {
    const { service, events, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue(published);

    await expect(service.adminBroadcastAnnouncement('admin', 'a1')).resolves.toEqual(
      { recipients: 2, pushed: 2 },
    );

    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith(
      'portal.announcement.published',
      expect.objectContaining({ recipientId: 'u1', announcementId: 'a1' }),
    );
    // След рассылки: админ должен видеть, что новость уже уходила.
    expect(prisma.announcement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ broadcastCount: { increment: 2 } }),
      }),
    );
  });

  it('без ступеней шлёт всем, со ступенями — только им', async () => {
    const { service, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue(published);

    await service.adminBroadcastAnnouncement('admin', 'a1');
    expect(prisma.user.findMany.mock.calls[0][0].where.spiritualStage).toBeUndefined();

    await service.adminBroadcastAnnouncement('admin', 'a1', {
      stages: ['seeker', 'yogi'],
    });
    expect(prisma.user.findMany.mock.calls[1][0].where.spiritualStage).toEqual({
      in: ['seeker', 'yogi'],
    });
  });

  it('отложенную новость разослать нельзя: на портале её ещё нет', async () => {
    const { service, events, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue({
      ...published,
      publishAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      service.adminBroadcastAnnouncement('admin', 'a1'),
    ).rejects.toThrow('не показывается');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('черновик разослать нельзя', async () => {
    const { service, events, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue({
      ...published,
      status: 'draft',
    });

    await expect(
      service.adminBroadcastAnnouncement('admin', 'a1'),
    ).rejects.toThrow('опубликуйте');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('рассылка закрыта для не-администратора', async () => {
    const { service, prisma } = build();

    await expect(
      service.adminBroadcastAnnouncement('user', 'a1'),
    ).rejects.toThrow();
    expect(prisma.announcement.findUnique).not.toHaveBeenCalled();
  });

  it('не берёт удалённые аккаунты', async () => {
    const { service, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue(published);

    await service.adminBroadcastAnnouncement('admin', 'a1');

    expect(prisma.user.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});

describe('ChangelogService: отметка «ознакомлен»', () => {
  function build() {
    const prisma = {
      announcement: { findMany: jest.fn(), findUnique: jest.fn() },
      announcementAck: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return {
      prisma,
      service: new ChangelogService(
        prisma as unknown as PrismaService,
        { emit: jest.fn() } as never,
        {} as never,
      ),
    };
  }

  const visible = {
    id: 'a1',
    status: 'published',
    publishAt: null,
    expiresAt: null,
    publishedAt: new Date('2026-08-20T09:00:00Z'),
    createdAt: new Date('2026-08-20T09:00:00Z'),
    pinned: true,
    titleRu: 'Открыли Студию',
    titleEn: 'Studio',
    bodyRu: 'Текст',
    bodyEn: 'Body',
    images: [],
  };

  it('без пользователя отметки не спрашивает и отдаёт acknowledged=false', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([visible]);

    const items = await service.listAnnouncements('ru');

    expect(items[0].acknowledged).toBe(false);
    expect(prisma.announcementAck.findMany).not.toHaveBeenCalled();
  });

  it('отмеченную новость помечает для этого человека', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([visible]);
    prisma.announcementAck.findMany.mockResolvedValue([{ announcementId: 'a1' }]);

    const items = await service.listAnnouncements('ru', 'u1');

    expect(items[0].acknowledged).toBe(true);
  });

  it('повторная отметка не падает и не задваивает счётчик', async () => {
    const { service, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue(visible);

    await expect(service.acknowledgeAnnouncement('u1', 'a1')).resolves.toEqual({
      ok: true,
    });
    // upsert, а не create: вторая вкладка не должна ловить ошибку уникальности.
    expect(prisma.announcementAck.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { announcementId_userId: { announcementId: 'a1', userId: 'u1' } },
        update: {},
      }),
    );
  });

  it('снятую с главной новость отметить нельзя', async () => {
    const { service, prisma } = build();
    prisma.announcement.findUnique.mockResolvedValue({
      ...visible,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });

    await expect(service.acknowledgeAnnouncement('u1', 'a1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.announcementAck.upsert).not.toHaveBeenCalled();
  });

  it('отмечает все видимые новости одним запросом', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prisma.announcementAck.createMany.mockResolvedValue({ count: 2 });

    await expect(service.acknowledgeAllAnnouncements('u1')).resolves.toEqual({
      ok: true,
      count: 2,
    });
    expect(prisma.announcementAck.createMany).toHaveBeenCalledWith({
      data: [
        { announcementId: 'a1', userId: 'u1' },
        { announcementId: 'a2', userId: 'u1' },
      ],
      // Уже отмеченное пропускаем: повтор с другой вкладки не должен падать.
      skipDuplicates: true,
    });
  });

  it('берёт только видимые: снятая с главной новость в отметку не попадает', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([{ id: 'a1' }]);

    await service.acknowledgeAllAnnouncements('u1');

    const where = prisma.announcement.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('published');
  });

  it('без новостей в базу не ходит', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([]);

    await expect(service.acknowledgeAllAnnouncements('u1')).resolves.toEqual({
      ok: true,
      count: 0,
    });
    expect(prisma.announcementAck.createMany).not.toHaveBeenCalled();
  });
});

describe('ChangelogService: картинки новостей (VED-137)', () => {
  const KEY_A = 'announcements/0000000a-aaaa-4bbb-8ccc-dddddddddddd.webp';
  const KEY_B = 'announcements/0000000b-aaaa-4bbb-8ccc-dddddddddddd.webp';
  const row = (key: string, sortOrder: number) => ({
    storageKey: key,
    url: `https://cdn.test/${key}`,
    width: 1280,
    height: 720,
    sortOrder,
  });
  const news = {
    id: 'a1',
    titleRu: 'Новость',
    titleEn: 'News',
    bodyRu: 'Текст',
    bodyEn: 'Body',
    status: 'draft',
    publishedAt: null,
    pinned: false,
    publishAt: null,
    expiresAt: null,
    broadcastAt: null,
    broadcastCount: 0,
    createdAt: new Date('2026-09-14T00:00:00Z'),
  };

  function build() {
    const tx = {
      announcement: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      announcementImage: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      announcement: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      announcementAck: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const images = {
      configured: true,
      urlFor: (key: string) => `https://cdn.test/${key}`,
      validate: jest.fn().mockReturnValue(null),
      store: jest.fn(),
      removeMany: jest.fn(),
    };
    const service = new ChangelogService(
      prisma as unknown as PrismaService,
      { emit: jest.fn() } as never,
      images as never,
    );
    return { service, prisma, tx, images };
  }

  it('создаёт новость с картинками в присланном порядке, адрес строит сам', async () => {
    const { service, tx } = build();
    tx.announcement.create.mockResolvedValue({
      ...news,
      images: [row(KEY_B, 0), row(KEY_A, 1)],
    });

    const created = await service.adminCreateAnnouncement('admin', {
      titleRu: 'Новость',
      titleEn: 'News',
      bodyRu: 'Текст',
      bodyEn: 'Body',
      images: [
        { key: KEY_B, width: 1280, height: 720 },
        { key: KEY_A, width: 1280, height: 720 },
      ],
    });

    expect(tx.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          images: { create: [row(KEY_B, 0), row(KEY_A, 1)] },
        }),
      }),
    );
    expect(created.images.map((image) => image.key)).toEqual([KEY_B, KEY_A]);
  });

  it('чужой ключ хранилища — 400, новость не создаётся', async () => {
    const { service, tx } = build();

    await expect(
      service.adminCreateAnnouncement('admin', {
        titleRu: 'Новость',
        titleEn: 'News',
        bodyRu: 'Текст',
        bodyEn: 'Body',
        images: [{ key: 'users/1/photo.webp', width: 10, height: 10 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.announcement.create).not.toHaveBeenCalled();
  });

  it('правка заменяет набор и убирает из хранилища только выброшенные картинки', async () => {
    const { service, prisma, tx, images } = build();
    prisma.announcement.findUnique.mockResolvedValue(news);
    tx.announcementImage.findMany.mockResolvedValue([
      { storageKey: KEY_A },
      { storageKey: KEY_B },
    ]);
    tx.announcement.update.mockResolvedValue({
      ...news,
      images: [row(KEY_B, 0)],
    });

    await service.adminUpdateAnnouncement('admin', 'a1', {
      images: [{ key: KEY_B, width: 1280, height: 720 }],
    });

    expect(tx.announcementImage.deleteMany).toHaveBeenCalledWith({
      where: { announcementId: 'a1' },
    });
    expect(tx.announcementImage.createMany).toHaveBeenCalledWith({
      data: [{ ...row(KEY_B, 0), announcementId: 'a1' }],
    });
    expect(images.removeMany).toHaveBeenCalledWith([KEY_A]);
  });

  it('правка без поля images картинки не трогает', async () => {
    const { service, prisma, tx, images } = build();
    prisma.announcement.findUnique.mockResolvedValue(news);
    tx.announcement.update.mockResolvedValue({
      ...news,
      images: [row(KEY_A, 0)],
    });

    await service.adminUpdateAnnouncement('admin', 'a1', { titleRu: 'Иначе' });

    expect(tx.announcementImage.deleteMany).not.toHaveBeenCalled();
    expect(tx.announcementImage.createMany).not.toHaveBeenCalled();
    expect(images.removeMany).toHaveBeenCalledWith([]);
  });

  it('удаление новости убирает её картинки из хранилища', async () => {
    const { service, prisma, images } = build();
    prisma.announcement.findUnique.mockResolvedValue({
      id: 'a1',
      images: [{ storageKey: KEY_A }],
    });

    await service.adminDeleteAnnouncement('admin', 'a1');

    expect(prisma.announcement.delete).toHaveBeenCalledWith({
      where: { id: 'a1' },
    });
    expect(images.removeMany).toHaveBeenCalledWith([KEY_A]);
  });

  it('публичный список отдаёт картинки без ключей хранилища', async () => {
    const { service, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([
      {
        ...news,
        status: 'published',
        publishedAt: new Date('2026-09-14T00:00:00Z'),
        images: [row(KEY_A, 0)],
      },
    ]);

    const [item] = await service.listAnnouncements('ru');

    expect(item.images).toEqual([
      { url: `https://cdn.test/${KEY_A}`, width: 1280, height: 720 },
    ]);
  });

  it('загрузка: неподходящий и битый файл — в списке ошибок, остальные загружены', async () => {
    const { service, images } = build();
    const file = (name: string) => ({
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      size: 1,
      originalname: name,
    });
    images.validate.mockImplementation((f: { originalname: string }) =>
      f.originalname === 'doc.pdf' ? 'Подходят JPG, PNG и WebP' : null,
    );
    images.store.mockImplementation((f: { originalname: string }) =>
      f.originalname === 'broken.png'
        ? Promise.reject(new Error('unsupported image format'))
        : Promise.resolve({ key: KEY_A, url: 'u', width: 1, height: 1 }),
    );

    const result = await service.adminUploadAnnouncementImages('admin', [
      file('shot.png'),
      file('doc.pdf'),
      file('broken.png'),
    ]);

    expect(result.images).toEqual([
      { key: KEY_A, url: 'u', width: 1, height: 1 },
    ]);
    expect(result.failed).toEqual([
      { fileName: 'doc.pdf', message: 'Подходят JPG, PNG и WebP' },
      { fileName: 'broken.png', message: 'Не получилось прочитать картинку' },
    ]);
  });

  it('загрузка картинок — только администратору', async () => {
    const { service } = build();
    await expect(
      service.adminUploadAnnouncementImages('user', []),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ChangelogService — новости на шину для официального канала', () => {
  const base = {
    id: 'a1',
    titleRu: 'Новость',
    titleEn: 'News',
    bodyRu: 'Текст',
    bodyEn: 'Body',
    status: 'draft',
    pinned: false,
    publishAt: null,
    expiresAt: null,
    publishedAt: null,
    broadcastAt: null,
    broadcastCount: 0,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    images: [] as {
      storageKey: string;
      url: string;
      width: number;
      height: number;
    }[],
  };

  function build() {
    const tx = {
      announcement: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      announcementImage: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      announcement: { findUnique: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const events = { emit: jest.fn() };
    const images = { urlFor: (key: string) => key, removeMany: jest.fn() };
    const service = new ChangelogService(
      prisma as unknown as PrismaService,
      events as never,
      images as never,
    );
    return { service, prisma, tx, events };
  }

  it('созданная опубликованной — событие первой публикации с автором', async () => {
    const { service, tx, events } = build();
    tx.announcement.create.mockResolvedValue({ ...base, status: 'published' });

    await service.adminCreateAnnouncement(
      'admin',
      { titleRu: 'Новость', titleEn: 'News', bodyRu: 'Текст', bodyEn: 'Body', status: 'published' },
      'admin-1',
    );

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'changelog.announcement.published',
      expect.objectContaining({
        announcementId: 'a1',
        firstPublication: true,
        title: 'Новость',
        path: '/updates/news',
        actorId: 'admin-1',
      }),
    );
  });

  it('созданный черновик шине не интересен', async () => {
    const { service, tx, events } = build();
    tx.announcement.create.mockResolvedValue(base);

    await service.adminCreateAnnouncement('admin', {
      titleRu: 'Новость',
      titleEn: 'News',
      bodyRu: 'Текст',
      bodyEn: 'Body',
    });

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('правка опубликованной — событие правки, не первой публикации', async () => {
    const { service, prisma, tx, events } = build();
    prisma.announcement.findUnique.mockResolvedValue({ ...base, status: 'published' });
    tx.announcement.update.mockResolvedValue({ ...base, status: 'published', titleRu: 'Иначе' });

    await service.adminUpdateAnnouncement('admin', 'a1', { titleRu: 'Иначе' });

    expect(events.emit).toHaveBeenCalledWith(
      'changelog.announcement.published',
      expect.objectContaining({ firstPublication: false, title: 'Иначе' }),
    );
  });

  it('опубликованную вернули в черновик — снятие', async () => {
    const { service, prisma, tx, events } = build();
    prisma.announcement.findUnique.mockResolvedValue({ ...base, status: 'published' });
    tx.announcement.update.mockResolvedValue(base);

    await service.adminUpdateAnnouncement('admin', 'a1', { status: 'draft' });

    expect(events.emit).toHaveBeenCalledWith('changelog.announcement.withdrawn', {
      announcementId: 'a1',
    });
  });

  it('удаление — снятие, после удаления из базы', async () => {
    const { service, prisma, events } = build();
    prisma.announcement.findUnique.mockResolvedValue({ id: 'a1', images: [] });

    await service.adminDeleteAnnouncement('admin', 'a1');

    expect(prisma.announcement.delete).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith('changelog.announcement.withdrawn', {
      announcementId: 'a1',
    });
  });

  it('упавшая запись в базу ничего на шину не отправляет', async () => {
    const { service, tx, events } = build();
    tx.announcement.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.adminCreateAnnouncement('admin', {
        titleRu: 'Новость',
        titleEn: 'News',
        bodyRu: 'Текст',
        bodyEn: 'Body',
        status: 'published',
      }),
    ).rejects.toThrow('db down');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
