import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NoticesService } from './notices.service';

/**
 * Юнит-тесты статусных переходов: сервис создаётся с моком Prisma,
 * остальные зависимости не используются в setStatus.
 */
function makeService(notice: Record<string, unknown>) {
  const prisma = {
    notice: {
      findUnique: jest.fn().mockResolvedValue(notice),
      update: jest.fn().mockResolvedValue({
        ...notice,
        status: 'published',
        publishedAt: new Date(),
        resolvedAt: null,
        startsAt: null,
        endsAt: null,
        repeat: 'none',
        repeatUntil: null,
        timeZone: null,
        venueName: null,
        isOnline: false,
        onlineUrl: null,
        audience: 'everyone',
        placePrecision: 'city',
        city: null,
        country: null,
        latitude: null,
        longitude: null,
        titleRu: 't',
        titleEn: null,
        descriptionRu: null,
        descriptionEn: null,
        needsReview: false,
        primaryImageUrl: null,
        responsesCount: 0,
        thanksCount: 0,
        viewsCount: 0,
        rubric: { id: 'r1', slug: 'help', titleRu: '', titleEn: '' },
        author: { id: 'author', name: 'A', avatarUrl: null },
        community: null,
        images: [],
      }),
    },
    noticeRubric: { update: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const service = new NoticesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: jest.fn() } as never,
  );
  // recountRubric дергает Prisma сложнее, чем нужно тесту — гасим.
  jest
    .spyOn(
      service as unknown as { recountRubric: () => Promise<void> },
      'recountRubric',
    )
    .mockResolvedValue(undefined);
  return { prisma, service };
}

const base = {
  id: 'n1',
  authorId: 'author',
  rubricId: 'r1',
  kind: 'offer',
  expiresAt: new Date(Date.now() + 86_400_000),
};

describe('NoticesService.setStatus — блокировка модерации', () => {
  it.each(['hidden_by_reports', 'removed_by_admin', 'moved_to_market'])(
    'автор не может вывести объявление из %s',
    async (status) => {
      const { prisma, service } = makeService({ ...base, status });
      await expect(
        service.setStatus('author', false, 'n1', { status: 'published' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.notice.update).not.toHaveBeenCalled();
    },
  );

  it('администратор может вернуть скрытое по жалобам объявление', async () => {
    const { prisma, service } = makeService({
      ...base,
      status: 'hidden_by_reports',
    });
    await service.setStatus('admin', true, 'n1', { status: 'published' });
    expect(prisma.notice.update).toHaveBeenCalledTimes(1);
  });

  it('автор может скрыть своё опубликованное объявление', async () => {
    const { prisma, service } = makeService({ ...base, status: 'published' });
    await service.setStatus('author', false, 'n1', {
      status: 'hidden_by_author',
    });
    expect(prisma.notice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'hidden_by_author' }),
      }),
    );
  });

  it('статус вне whitelist отвергается как 400', async () => {
    const { prisma, service } = makeService({ ...base, status: 'published' });
    await expect(
      service.setStatus('author', false, 'n1', {
        status: 'removed_by_admin' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notice.update).not.toHaveBeenCalled();
  });
});

// VED-42: удалить можно своё, администратору Объявлений — любое. Чужое
// удаление уходит в журнал админки: объявление исчезает насовсем.
describe('NoticesService.remove', () => {
  function removeSetup() {
    const prisma = {
      notice: {
        findUnique: jest.fn().mockResolvedValue({
          ...base,
          titleRu: 'Отдам книги',
          titleEn: null,
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      noticeImage: {
        findMany: jest.fn().mockResolvedValue([{ storageKey: 'k1' }]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Александр',
          spiritualName: 'Ачьюта дас',
        }),
      },
    };
    const images = { removeMany: jest.fn().mockResolvedValue(undefined) };
    const bus = { emit: jest.fn() };
    const service = new NoticesService(
      prisma as never,
      {} as never,
      {} as never,
      images as never,
      {} as never,
      bus as never,
    );
    jest
      .spyOn(
        service as unknown as { recountRubric: () => Promise<void> },
        'recountRubric',
      )
      .mockResolvedValue(undefined);
    return { prisma, images, bus, service };
  }

  it('автор удаляет своё без записи в журнал', async () => {
    const { prisma, images, bus, service } = removeSetup();

    await service.remove('author', false, 'n1');

    expect(prisma.notice.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    expect(images.removeMany).toHaveBeenCalledWith(['k1']);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('участник чужое удалить не может', async () => {
    const { prisma, service } = removeSetup();

    await expect(service.remove('stranger', false, 'n1')).rejects.toThrow(
      'Объявление не найдено',
    );
    expect(prisma.notice.delete).not.toHaveBeenCalled();
  });

  it('администратор удаляет чужое, и это видно в журнале', async () => {
    const { prisma, bus, service } = removeSetup();

    await service.remove('admin', true, 'n1');

    expect(prisma.notice.delete).toHaveBeenCalled();
    expect(bus.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin',
      action: 'notices.notice-deleted',
      targetType: 'notice',
      targetId: 'n1',
      // Мирское имя, а не духовное: журнал — identity-критичный экран вроде
      // модерации («кто, чьё, когда»), где по духовному имени не понять, кто
      // перед тобой (то же исключение, что у MusicAdminQueueService). Мок
      // намеренно даёт оба поля — тест проверяет, что spiritualName
      // игнорируется, а не просто отсутствует в моке.
      details: { authorName: 'Александр', title: 'Отдам книги' },
    });
  });

  it('если автора уже нет в базе, запись всё равно уходит — с сырым id как запасным вариантом', async () => {
    const { prisma, bus, service } = removeSetup();
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await service.remove('admin', true, 'n1');

    expect(bus.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin',
      action: 'notices.notice-deleted',
      targetType: 'notice',
      targetId: 'n1',
      details: { authorName: 'author', title: 'Отдам книги' },
    });
  });
});

describe('NoticesService.adminList — список для админки (VED-42, круг 2)', () => {
  function adminListSetup() {
    const rows = [
      {
        id: 'n1',
        titleRu: 'Отдам книги',
        titleEn: null,
        status: 'published',
        kind: 'offer',
        city: 'Москва',
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
        expiresAt: new Date('2026-10-10T00:00:00.000Z'),
        author: { name: 'Александр' },
      },
    ];
    const prisma = {
      notice: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const service = new NoticesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: jest.fn() } as never,
    );
    return { prisma, service };
  }

  it('собирает читаемую строку: заголовок, мирское имя автора, даты строками', async () => {
    const { service } = adminListSetup();
    const response = await service.adminList({});
    expect(response.items).toEqual([
      {
        id: 'n1',
        title: 'Отдам книги',
        status: 'published',
        kind: 'offer',
        authorName: 'Александр',
        city: 'Москва',
        createdAt: '2026-09-10T00:00:00.000Z',
        expiresAt: '2026-10-10T00:00:00.000Z',
      },
    ]);
    expect(response).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('без заголовка на обеих локалях — запасной текст', async () => {
    const { prisma, service } = adminListSetup();
    prisma.notice.findMany.mockResolvedValueOnce([
      {
        id: 'n2',
        titleRu: null,
        titleEn: null,
        status: 'draft',
        kind: 'request',
        city: null,
        createdAt: new Date('2026-09-11T00:00:00.000Z'),
        expiresAt: new Date('2026-10-11T00:00:00.000Z'),
        author: { name: 'Мария' },
      },
    ]);
    const response = await service.adminList({});
    expect(response.items[0].title).toBe('Без названия');
  });

  it('фильтр и поиск доходят до Prisma через where', async () => {
    const { prisma, service } = adminListSetup();
    await service.adminList({ q: 'книги', status: 'published' });
    const call = prisma.notice.findMany.mock.calls[0][0] as {
      where: { status?: string; OR?: unknown[] };
    };
    expect(call.where.status).toBe('published');
    expect(call.where.OR).toHaveLength(3);
    expect(prisma.notice.count).toHaveBeenCalledWith({ where: call.where });
  });

  it('страница считается по общему числу и размеру страницы', async () => {
    const { prisma, service } = adminListSetup();
    prisma.notice.count.mockResolvedValueOnce(45);
    const response = await service.adminList({ page: '2', pageSize: '20' });
    expect(response).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    const call = prisma.notice.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(call.skip).toBe(20);
    expect(call.take).toBe(20);
  });

  it('пустой список — totalPages не падает до нуля', async () => {
    const { prisma, service } = adminListSetup();
    prisma.notice.count.mockResolvedValueOnce(0);
    prisma.notice.findMany.mockResolvedValueOnce([]);
    const response = await service.adminList({});
    expect(response).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });
});
