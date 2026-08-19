import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupportService } from './support.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    supportTicket: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          number: 1,
          trackToken: String(data.trackToken),
          status: 'open',
          createdAt: new Date('2026-07-28T10:00:00.000Z'),
        });
      }),
    },
  } as unknown as PrismaService;

  return {
    service: new SupportService(prisma, { emit: jest.fn() } as never),
    created,
    prisma,
  };
}

describe('SupportService.create', () => {
  it('требует контакт у гостя', async () => {
    const { service } = createService();
    await expect(
      service.create({ subject: 'Тема', message: 'Текст' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает гостевое обращение с telegram и нормализует его', async () => {
    const { service, created } = createService();
    const result = await service.create({
      subject: 'Оплата',
      message: 'Как оплатить в USDT?',
      category: 'billing',
      contactTelegram: 'https://t.me/devotee_01',
    });

    expect(result.number).toBe(1);
    expect(created[0]).toMatchObject({
      contactTelegram: '@devotee_01',
      category: 'billing',
      userId: null,
    });
  });

  it('отклоняет некорректный email', async () => {
    const { service } = createService();
    await expect(
      service.create({
        subject: 'Тема',
        message: 'Текст',
        contactEmail: 'не-почта',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('авторизованному контакт не обязателен: подставляется email аккаунта', async () => {
    const { service, created } = createService();
    await service.create(
      { subject: 'Тема', message: 'Текст' },
      { sub: 'user-1', email: 'user@example.com' },
    );

    expect(created[0]).toMatchObject({
      userId: 'user-1',
      contactEmail: 'user@example.com',
    });
  });

  it('пустая тема — ошибка валидации', async () => {
    const { service } = createService();
    await expect(
      service.create(
        { subject: '   ', message: 'Текст' },
        { sub: 'user-1', email: 'user@example.com' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SupportService admin guards', () => {
  it('не пускает обычного пользователя в очередь обращений', async () => {
    const { service } = createService();
    await expect(service.adminList('user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
