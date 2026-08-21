import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationBroadcastService } from './notification-broadcast.service';
import type { PrismaService } from '../../prisma/prisma.service';

type Row = Record<string, unknown>;

function createService(row: Row | null = null) {
  const state = { row, userCount: 5 };
  const prisma = {
    notificationBroadcast: {
      findUnique: jest.fn(() => Promise.resolve(state.row)),
      findMany: jest.fn(() => Promise.resolve([])),
      create: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve({ ...data, createdAt: new Date() }),
      ),
      update: jest.fn(({ data }: { data: Row }) =>
        Promise.resolve({ ...data, createdAt: new Date(), attemptCount: 1 }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      delete: jest.fn(() => Promise.resolve(state.row)),
    },
    user: { count: jest.fn(() => Promise.resolve(state.userCount)) },
  };
  const service = new NotificationBroadcastService(
    prisma as unknown as PrismaService,
  );
  // byId читает строку заново после каждой команды; тесты проверяют команды,
  // а не сборку DTO, поэтому чтение подменяется целиком.
  jest.spyOn(service, 'byId').mockResolvedValue({ id: 'b-1' } as never);
  return { service, prisma, state };
}

/** expect.objectContaining типизирован как `any`; оборачиваем в одном месте,
 *  чтобы не глушить правило на каждой проверке. */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

const draft: Row = {
  id: 'b-1',
  title: 'Плановые работы',
  body: 'Портал будет недоступен час',
  url: null,
  important: false,
  audience: {},
  status: 'draft',
};

describe('NotificationBroadcastService.create', () => {
  it('обрезает пробелы и нормализует пустой фильтр', async () => {
    const { service, prisma } = createService();

    await service.create('admin-1', {
      title: '  Привет  ',
      body: '  Текст  ',
      audience: { stages: [] },
    });

    expect(prisma.notificationBroadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: containing({
          title: 'Привет',
          body: 'Текст',
          audience: {},
          createdById: 'admin-1',
        }),
      }),
    );
  });

  it('не создаёт рассылку без заголовка или текста', async () => {
    const { service } = createService();

    await expect(
      service.create('admin-1', { title: '   ', body: 'Текст' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('admin-1', { title: 'Заголовок', body: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не принимает ссылку на чужой сайт', async () => {
    const { service } = createService();

    await expect(
      service.create('admin-1', {
        title: 'Заголовок',
        body: 'Текст',
        url: 'https://example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает внутреннюю ссылку', async () => {
    const { service, prisma } = createService();

    await service.create('admin-1', {
      title: 'Заголовок',
      body: 'Текст',
      url: '/updates',
    });

    expect(prisma.notificationBroadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: containing({ url: '/updates' }),
      }),
    );
  });
});

describe('NotificationBroadcastService.update', () => {
  it('правит только черновик', async () => {
    const { service } = createService({ ...draft, status: 'sent' });

    await expect(
      service.update('b-1', { title: 'Другой' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('несуществующую рассылку не находит', async () => {
    const { service } = createService(null);

    await expect(service.update('b-1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('NotificationBroadcastService.start', () => {
  it('переводит в отправку и запоминает размер аудитории', async () => {
    const { service, prisma } = createService(draft);

    await service.start('b-1');

    expect(prisma.notificationBroadcast.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: 'draft' },
      data: containing({
        status: 'sending',
        totalRecipients: 5,
        cursorUserId: null,
        deliveredCount: 0,
      }),
    });
  });

  it('не запускает рассылку в пустоту', async () => {
    const { service, state } = createService(draft);
    state.userCount = 0;

    await expect(service.start('b-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('второй одновременный запуск не проходит', async () => {
    const { service, prisma } = createService(draft);
    prisma.notificationBroadcast.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.start('b-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('NotificationBroadcastService.cancel', () => {
  it('отменяет черновик и отправку', async () => {
    const { service, prisma } = createService(draft);

    await service.cancel('b-1');

    expect(prisma.notificationBroadcast.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: { in: ['draft', 'sending'] } },
      data: containing({ status: 'cancelled' }),
    });
  });

  it('завершённую отменить нельзя', async () => {
    const { service, prisma } = createService({ ...draft, status: 'sent' });
    prisma.notificationBroadcast.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel('b-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
