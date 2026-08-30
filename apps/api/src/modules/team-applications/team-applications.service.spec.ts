import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamApplicationsService } from './team-applications.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    teamApplication: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'application-1',
          status: 'submitted',
          createdAt: new Date('2026-08-31T10:00:00.000Z'),
        });
      }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const events = { emit: jest.fn() };

  return {
    service: new TeamApplicationsService(prisma, events as never),
    created,
    prisma,
    events,
  };
}

describe('TeamApplicationsService.create', () => {
  it('требует контакт у кандидата', async () => {
    const { service } = createService();
    await expect(
      service.create({ role: 'backend', message: 'Хочу помочь с бэкендом' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает заявку с telegram и нормализует его', async () => {
    const { service, created } = createService();
    const result = await service.create({
      role: 'security',
      message: 'Занимаюсь пентестами пять лет',
      contactTelegram: 'https://t.me/sec_expert',
    });

    expect(result.status).toBe('submitted');
    expect(created[0]).toMatchObject({
      role: 'security',
      contactTelegram: '@sec_expert',
      roleOther: null,
    });
  });

  it('требует roleOther при role = other', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'other',
        message: 'Текст',
        contactEmail: 'a@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает role = other с заполненным roleOther', async () => {
    const { service, created } = createService();
    await service.create({
      role: 'other',
      roleOther: 'Продюсер контента',
      message: 'Текст',
      contactEmail: 'a@example.com',
    });
    expect(created[0]).toMatchObject({
      role: 'other',
      roleOther: 'Продюсер контента',
    });
  });

  it('отклоняет некорректную ссылку на портфолио', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'design',
        message: 'Текст',
        contactEmail: 'a@example.com',
        portfolioUrl: 'not-a-url',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('уведомляет активных админов о новой заявке', async () => {
    const { service, events, prisma } = createService();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    await service.create({
      role: 'security',
      message: 'Текст',
      contactEmail: 'a@example.com',
    });
    // notifyAdmins не awaited в create(): даём микрозадачам отработать.
    await new Promise((resolve) => setImmediate(resolve));

    expect(events.emit).toHaveBeenCalledWith('team.application.received', {
      name: 'team.application.received',
      recipientId: 'admin-1',
      applicationId: 'application-1',
      roleLabel: 'Специалист по безопасности',
    });
    expect(events.emit).toHaveBeenCalledWith('team.application.received', {
      name: 'team.application.received',
      recipientId: 'admin-2',
      applicationId: 'application-1',
      roleLabel: 'Специалист по безопасности',
    });
  });

  it('пустое сообщение — ошибка валидации', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'backend',
        message: '   ',
        contactEmail: 'a@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TeamApplicationsService admin guards', () => {
  it('не пускает обычного пользователя в список заявок', async () => {
    const { service } = createService();
    await expect(service.adminList('user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
