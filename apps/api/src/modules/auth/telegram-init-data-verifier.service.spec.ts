import { createHmac } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { TelegramInitDataVerifierService } from './telegram-init-data-verifier.service';

const TOKEN = '123456:TEST-token_for-specs-only-000000000';
const TG_USER = { id: 770402, first_name: 'Говинда' };

/** Тот же приём, что в telegram-init-data.spec.ts / telegram-login.service.spec.ts. */
function initData(user: object = TG_USER, token = TOKEN): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000) - 5),
    user: JSON.stringify(user),
  };
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function setup() {
  const prisma = {
    userIdentity: { findUnique: jest.fn() },
  };
  const config = {
    get: jest.fn(() => TOKEN),
  };
  const service = new TelegramInitDataVerifierService(
    config as never,
    prisma as unknown as PrismaService,
  );
  return { service, prisma, config };
}

describe('TelegramInitDataVerifierService.verify', () => {
  it('делегирует verifyTelegramInitData, в базу не ходит', () => {
    const { service, prisma } = setup();
    const result = service.verify(initData());
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        user: expect.objectContaining({ id: 770402 }),
      }),
    );
    expect(prisma.userIdentity.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * Раунд оценки вехи 4, п.7 (живой стенд оркестратора): `POST
 * /notifications/telegram/enable` раньше доверял одной подписи и позволял
 * Радхе прислать initData Говинды (770402), забрав его устройство. Тесты
 * ниже воспроизводят ровно этот сценарий на уровне сервиса.
 */
describe('TelegramInitDataVerifierService.verifyForUser', () => {
  it('Telegram привязан к вызывающему — ok', async () => {
    const { service, prisma } = setup();
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'govinda' });

    const result = await service.verifyForUser(initData(), 'govinda');

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        user: expect.objectContaining({ id: 770402 }),
      }),
    );
    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        provider_externalId: { provider: 'telegram', externalId: '770402' },
      },
      select: { userId: true },
    });
  });

  it('подпись подлинная, но Telegram привязан к другому аккаунту — not-linked, устройство не угнать', async () => {
    const { service, prisma } = setup();
    // Говинды initData подписаны подлинно, но чат привязан к самому Говинде,
    // не к Радхе, которая его прислала.
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'govinda' });

    const result = await service.verifyForUser(initData(), 'radha');

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
  });

  it('Telegram вообще ни к кому не привязан — not-linked', async () => {
    const { service, prisma } = setup();
    prisma.userIdentity.findUnique.mockResolvedValue(null);

    const result = await service.verifyForUser(initData(), 'radha');

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
  });

  it('плохая подпись — отказ до похода в базу', async () => {
    const { service, prisma } = setup();

    const result = await service.verifyForUser(
      initData(TG_USER, '999:other-token-0000000000000000000'),
      'radha',
    );

    expect(result).toEqual({ ok: false, reason: 'bad-signature' });
    expect(prisma.userIdentity.findUnique).not.toHaveBeenCalled();
  });
});
