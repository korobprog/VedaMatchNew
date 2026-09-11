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
      details: { authorId: 'author', title: 'Отдам книги' },
    });
  });
});
