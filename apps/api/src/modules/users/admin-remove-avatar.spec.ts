import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

/**
 * Администрация убирает фото профиля (VED-471). Сам `getUser` подменяется,
 * как в соседних тестах: проверяется удаление, журнал и уведомление.
 */
describe('AdminUsersService.removeAvatar', () => {
  const admin = { sub: 'admin-1', role: 'admin' as const };

  function build(avatarUrl: string | null) {
    const users = {
      getProfile: jest.fn().mockResolvedValue({ id: 'u-1', avatarUrl }),
      deleteAvatar: jest.fn().mockResolvedValue({}),
    };
    const events = { emit: jest.fn() };
    const service = new AdminUsersService(
      {} as never,
      users as never,
      { get: () => undefined } as never,
      events as never,
    );
    jest.spyOn(service, 'getUser').mockResolvedValue({} as never);
    return { service, users, events };
  }

  it('удаляет фото, пишет журнал и говорит человеку', async () => {
    const { service, users, events } = build('https://cdn/a.webp');

    await service.removeAvatar(admin, 'u-1', { reason: '  Чужое фото  ' });

    expect(users.deleteAvatar).toHaveBeenCalledWith('u-1');
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'user.avatar-removed',
      targetType: 'user',
      targetId: 'u-1',
      details: { reason: 'Чужое фото' },
    });
    expect(events.emit).toHaveBeenCalledWith('portal.profile.edited-by-admin', {
      name: 'portal.profile.edited-by-admin',
      recipientId: 'u-1',
      fields: ['avatar'],
      reason: 'Чужое фото',
    });
  });

  it('без пояснения — пояснения нет и в уведомлении', async () => {
    const { service, events } = build('https://cdn/a.webp');

    await service.removeAvatar(admin, 'u-1', undefined);

    expect(events.emit).toHaveBeenCalledWith(
      'portal.profile.edited-by-admin',
      expect.objectContaining({ reason: null }),
    );
  });

  it('фото уже нет — ничего не удаляет и никому не пишет', async () => {
    const { service, users, events } = build(null);

    await service.removeAvatar(admin, 'u-1', {});

    expect(users.deleteAvatar).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('своё фото — без уведомления самому себе, но в журнал', async () => {
    const { service, events } = build('https://cdn/a.webp');

    await service.removeAvatar(admin, 'admin-1', {});

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({ action: 'user.avatar-removed' }),
    );
  });

  it('доступно только администратору', async () => {
    const { service, users } = build('https://cdn/a.webp');

    await expect(
      service.removeAvatar(
        { sub: 'm-1', role: 'moderator' as never },
        'u-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.deleteAvatar).not.toHaveBeenCalled();
  });

  it('длинное пояснение не принимает', async () => {
    const { service, users } = build('https://cdn/a.webp');

    await expect(
      service.removeAvatar(admin, 'u-1', { reason: 'а'.repeat(301) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.deleteAvatar).not.toHaveBeenCalled();
  });
});
