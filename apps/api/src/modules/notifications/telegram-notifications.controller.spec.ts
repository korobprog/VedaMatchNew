// Настоящий AuthGuard тянет jose (ESM) — jest его не разбирает, см.
// union-recommendations.controller.spec.ts. Методы вызываются напрямую, без
// прохода через guard-конвейер Nest.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { TelegramInitDataVerifierService } from '../auth/telegram-init-data-verifier.service';
import { TelegramNotificationsController } from './telegram-notifications.controller';
import type { TelegramNotificationsService } from './telegram-notifications.service';
import type { TelegramSenderService } from './telegram-sender.service';

function setup() {
  const telegram = {
    status: jest.fn(),
    setEnabled: jest.fn(),
    enable: jest.fn().mockResolvedValue({ connected: true, enabled: true }),
  };
  const verifier = { verifyForUser: jest.fn(), verify: jest.fn() };
  const sender = { getBotStatus: jest.fn() };
  const controller = new TelegramNotificationsController(
    telegram as unknown as TelegramNotificationsService,
    verifier as unknown as TelegramInitDataVerifierService,
    sender as unknown as TelegramSenderService,
  );
  return { controller, telegram, verifier, sender };
}

/**
 * Раунд оценки вехи 4, п.7 (живой стенд): `POST /notifications/telegram/enable`
 * доверял одной подписи `initData` и позволял привязать чат ЛЮБОГО
 * телеграм-пользователя (например, Говинды) к чужой сессии (Радхи).
 * `verifyForUser` теперь сверяет ещё и владение — эти тесты фиксируют
 * контракт контроллера с ним.
 */
describe('TelegramNotificationsController.enable', () => {
  it('Telegram привязан к вызывающему — заводит устройство', async () => {
    const { controller, telegram, verifier } = setup();
    verifier.verifyForUser.mockResolvedValue({
      ok: true,
      user: { id: 770402, firstName: 'Говинда' },
      authDate: 1,
    });

    const result = await controller.enable({ sub: 'govinda' } as never, {
      initData: 'signed-by-govinda',
    });

    expect(verifier.verifyForUser).toHaveBeenCalledWith(
      'signed-by-govinda',
      'govinda',
    );
    expect(telegram.enable).toHaveBeenCalledWith('govinda', '770402');
    expect(result).toEqual({ connected: true, enabled: true });
  });

  it('подлинная подпись чужого чата — 409, устройство не заводится', async () => {
    const { controller, telegram, verifier } = setup();
    verifier.verifyForUser.mockResolvedValue({
      ok: false,
      reason: 'not-linked',
    });

    await expect(
      controller.enable({ sub: 'radha' } as never, {
        initData: 'signed-by-govinda',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(telegram.enable).not.toHaveBeenCalled();
  });

  it('битая подпись — 401', async () => {
    const { controller, telegram, verifier } = setup();
    verifier.verifyForUser.mockResolvedValue({
      ok: false,
      reason: 'bad-signature',
    });

    await expect(
      controller.enable({ sub: 'radha' } as never, { initData: 'x' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(telegram.enable).not.toHaveBeenCalled();
  });

  it('бот не настроен — 503', async () => {
    const { controller, telegram, verifier } = setup();
    verifier.verifyForUser.mockResolvedValue({
      ok: false,
      reason: 'not-configured',
    });

    await expect(
      controller.enable({ sub: 'radha' } as never, { initData: 'x' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(telegram.enable).not.toHaveBeenCalled();
  });
});

describe('TelegramNotificationsController.botStatus', () => {
  it('не админ — 403, Bot API не дёргается', () => {
    const { controller, sender } = setup();

    // `botStatus` бросает синхронно (проверка роли до похода в Bot API),
    // поэтому `toThrow`, а не `rejects` — см. controller.enable ниже, где
    // отказ уходит через отклонённый промис.
    expect(() =>
      controller.botStatus({ sub: 'radha', role: 'user' } as never),
    ).toThrow(ForbiddenException);
    expect(sender.getBotStatus).not.toHaveBeenCalled();
  });

  it('админ — вызывает getBotStatus', async () => {
    const { controller, sender } = setup();
    sender.getBotStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      username: 'vedamatch_bot',
    });

    await expect(
      controller.botStatus({ sub: 'admin1', role: 'admin' } as never),
    ).resolves.toEqual({
      configured: true,
      reachable: true,
      username: 'vedamatch_bot',
    });
  });
});
