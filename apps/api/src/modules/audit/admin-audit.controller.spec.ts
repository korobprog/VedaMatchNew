import { ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';

// AuthGuard тянет за собой jose (ESM), который jest не разбирает.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { AdminAuditController } from './admin-audit.controller';
import type { AdminAuditService } from './admin-audit.service';

function createController() {
  const audit = { list: jest.fn(() => Promise.resolve('ok')) };
  return {
    audit,
    controller: new AdminAuditController(audit as unknown as AdminAuditService),
  };
}

function user(overrides: Partial<AccessTokenPayload>): AccessTokenPayload {
  return {
    sub: 'u1',
    email: 'a@b.c',
    role: 'user',
    ...overrides,
  };
}

describe('AdminAuditController.list', () => {
  it('admin получает список без ограничения по действиям', async () => {
    const { audit, controller } = createController();

    await controller.list(user({ role: 'admin' }), {});

    expect(audit.list).toHaveBeenCalledWith({});
  });

  it('service-admin Объявлений получает список, урезанный до своих действий', async () => {
    const { audit, controller } = createController();

    await controller.list(
      user({ role: 'service-admin', adminServices: ['notices'] }),
      {},
    );

    expect(audit.list).toHaveBeenCalledWith({}, [
      'notices.report-resolved',
      'notices.notice-deleted',
    ]);
  });

  it('service-admin запрашивает своё действие — проходит', async () => {
    const { audit, controller } = createController();

    await controller.list(
      user({ role: 'service-admin', adminServices: ['notices'] }),
      { action: 'notices.notice-deleted' },
    );

    expect(audit.list).toHaveBeenCalledWith(
      { action: 'notices.notice-deleted' },
      ['notices.report-resolved', 'notices.notice-deleted'],
    );
  });

  it('service-admin запрашивает чужое действие — 403 именно на него', () => {
    const { audit, controller } = createController();

    // Контроллер бросает синхронно (до await service.list), поэтому
    // rejects.* здесь не годится: вызов упал бы раньше, чем expect его
    // обернёт — нужен именно toThrow вокруг самого вызова.
    expect(() =>
      controller.list(
        user({ role: 'service-admin', adminServices: ['notices'] }),
        { action: 'market.listing-hidden' },
      ),
    ).toThrow(ForbiddenException);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it('service-admin запрашивает портальное действие — тоже 403', () => {
    const { audit, controller } = createController();

    expect(() =>
      controller.list(
        user({ role: 'service-admin', adminServices: ['notices'] }),
        { action: 'user.blocked' },
      ),
    ).toThrow(ForbiddenException);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it('мусорная строка в action не роняет запрос — просто игнорируется', async () => {
    const { audit, controller } = createController();

    await controller.list(
      user({ role: 'service-admin', adminServices: ['notices'] }),
      { action: 'nope' as never },
    );

    expect(audit.list).toHaveBeenCalledWith({ action: 'nope' }, [
      'notices.report-resolved',
      'notices.notice-deleted',
    ]);
  });

  it('service-admin без единого сервиса — 403 на весь журнал', () => {
    const { audit, controller } = createController();

    expect(() =>
      controller.list(user({ role: 'service-admin', adminServices: [] }), {}),
    ).toThrow(ForbiddenException);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it('обычный пользователь получает 403', () => {
    const { audit, controller } = createController();

    expect(() => controller.list(user({ role: 'user' }), {})).toThrow(
      ForbiddenException,
    );
    expect(audit.list).not.toHaveBeenCalled();
  });
});
