import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

/**
 * Выдача сервисов администратору сервиса. Сам `getUser` в проверках не
 * участвует — он подменяется, чтобы тест не тянул за собой весь профиль.
 */
describe('AdminUsersService.updateAdminServices', () => {
  const admin = { sub: 'admin-1', role: 'admin' as const };

  function build(userRole: string) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u-1', role: userRole }),
      },
      service: {
        findMany: jest
          .fn()
          .mockImplementation((args: { where: { slug: { in: string[] } } }) =>
            Promise.resolve(
              args.where.slug.in.map((slug) => ({ id: `svc-${slug}`, slug })),
            ),
          ),
      },
      serviceAdmin: {
        deleteMany: jest.fn().mockReturnValue('delete'),
        createMany: jest.fn().mockReturnValue('create'),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const events = { emit: jest.fn() };
    const service = new AdminUsersService(
      prisma as never,
      {} as never,
      { get: () => undefined } as never,
      events as never,
    );
    jest
      .spyOn(service, 'getUser')
      .mockResolvedValue({ profile: { adminServices: [] } } as never);
    return { service, prisma, events };
  }

  it('заменяет набор сервисов одной транзакцией', async () => {
    const { service, prisma } = build('service_admin');

    await service.updateAdminServices(admin, 'u-1', {
      services: ['market', 'notices'],
    });

    expect(prisma.serviceAdmin.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
    });
    expect(prisma.serviceAdmin.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u-1', serviceId: 'svc-market' },
        { userId: 'u-1', serviceId: 'svc-notices' },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['delete', 'create']);
  });

  it('оставляет след в журнале действий', async () => {
    const { service, events } = build('service_admin');

    await service.updateAdminServices(admin, 'u-1', { services: ['market'] });

    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'user.services-changed',
      targetType: 'user',
      targetId: 'u-1',
      details: { services: 'market' },
    });
  });

  it('снимает дубли из запроса', async () => {
    const { service, prisma } = build('service_admin');

    await service.updateAdminServices(admin, 'u-1', {
      services: ['market', 'market'],
    });

    expect(prisma.serviceAdmin.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u-1', serviceId: 'svc-market' }],
    });
  });

  it('позволяет очистить список у любой роли', async () => {
    const { service, prisma } = build('user');

    await service.updateAdminServices(admin, 'u-1', { services: [] });

    expect(prisma.serviceAdmin.deleteMany).toHaveBeenCalled();
  });

  it('не выдаёт сервисы роли, которая ими не пользуется', async () => {
    const { service } = build('user');

    await expect(
      service.updateAdminServices(admin, 'u-1', { services: ['market'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет слаг, которого нет в списке админских сервисов', async () => {
    const { service } = build('service_admin');

    await expect(
      service.updateAdminServices(admin, 'u-1', {
        services: ['support' as never],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('доступно только роли admin', async () => {
    const { service } = build('service_admin');

    await expect(
      service.updateAdminServices(
        { sub: 'sa-1', role: 'service-admin' },
        'u-1',
        { services: ['market'] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
