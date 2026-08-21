import { BadRequestException } from '@nestjs/common';
import {
  normalizeSettings,
  PlatformSettingsService,
} from './platform-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('normalizeSettings', () => {
  it('пустое тело не меняет ничего', () => {
    expect(normalizeSettings({})).toEqual({});
  });

  it('правка регистрации не трогает биллинг', () => {
    expect(normalizeSettings({ registrationMode: 'closed' })).toEqual({
      registrationMode: 'closed',
    });
  });

  it('проверяет режимы по спискам', () => {
    expect(() => normalizeSettings({ billingMode: 'free' as never })).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeSettings({ registrationMode: 'invite' as never }),
    ).toThrow(BadRequestException);
  });

  it('пустой текст отказа означает «убрать», а не пустое сообщение', () => {
    expect(normalizeSettings({ registrationNote: '   ' })).toEqual({
      registrationNote: null,
    });
    expect(normalizeSettings({ registrationNote: null })).toEqual({
      registrationNote: null,
    });
  });

  it('обрезает пробелы у текста отказа', () => {
    expect(normalizeSettings({ registrationNote: '  Закрыто  ' })).toEqual({
      registrationNote: 'Закрыто',
    });
  });

  it('слишком длинный текст отказа не принимает', () => {
    expect(() =>
      normalizeSettings({ registrationNote: 'я'.repeat(301) }),
    ).toThrow(BadRequestException);
  });
});

function createService(current: {
  billingMode: string;
  registrationMode: string;
}) {
  const prisma = {
    appSettings: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          ...current,
          registrationNote: null,
          updatedAt: new Date('2026-08-21T00:00:00.000Z'),
        }),
      ),
      upsert: jest.fn(({ update }: { update: Record<string, unknown> }) =>
        Promise.resolve({
          ...current,
          ...update,
          registrationNote: null,
          updatedAt: new Date('2026-08-21T01:00:00.000Z'),
        }),
      ),
    },
  };
  const events = { emit: jest.fn() };
  const service = new PlatformSettingsService(
    prisma as unknown as PrismaService,
    { get: () => undefined } as never,
    events as never,
  );
  return { service, prisma, events };
}

/** Имена событий из мока: `mock.calls` типизирован как any[]. */
function emittedActions(events: { emit: jest.Mock }): string[] {
  return events.emit.mock.calls.map((call: unknown[]) => {
    const event = call[1] as { action: string };
    return event.action;
  });
}

describe('PlatformSettingsService.update', () => {
  it('пишет в журнал только то, что действительно изменилось', async () => {
    const { service, events } = createService({
      billingMode: 'business',
      registrationMode: 'open',
    });

    await service.update('admin-1', {
      billingMode: 'business',
      registrationMode: 'closed',
    });

    const actions = emittedActions(events);
    expect(actions).toEqual(['platform.registration-changed']);
  });

  it('смена обоих режимов даёт два разных события', async () => {
    const { service, events } = createService({
      billingMode: 'business',
      registrationMode: 'open',
    });

    await service.update('admin-1', {
      billingMode: 'beta',
      registrationMode: 'closed',
    });

    const actions = emittedActions(events);
    expect(actions).toEqual([
      'billing.mode-changed',
      'platform.registration-changed',
    ]);
  });

  it('пустое тело отклоняет, а не пишет пустое обновление', async () => {
    const { service, prisma } = createService({
      billingMode: 'business',
      registrationMode: 'open',
    });

    await expect(service.update('admin-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.appSettings.upsert).not.toHaveBeenCalled();
  });
});
