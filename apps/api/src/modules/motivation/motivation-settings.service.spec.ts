import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MotivationSettingsService,
  SETTINGS_FALLBACK,
} from './motivation-settings.service';

function build(
  row: Record<string, unknown> | null,
  env: Record<string, string> = {},
) {
  const saved: Array<Record<string, unknown>> = [];
  const prisma = {
    motivationSettings: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(async (args: { update: Record<string, unknown> }) => {
        saved.push(args.update);
        return row;
      }),
    },
  } as unknown as PrismaService;
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return { service: new MotivationSettingsService(prisma, config), saved };
}

describe('MotivationSettingsService', () => {
  it('значение из базы главнее окружения', async () => {
    const { service } = build(
      { videoModel: 'из/базы' },
      { MOTIVATION_VIDEO_MODEL: 'из/окружения' },
    );

    await expect(service.read()).resolves.toMatchObject({
      videoModel: 'из/базы',
    });
  });

  it('без записи в базе берёт окружение', async () => {
    // Так перенос настроек можно делать по одной, ничего не ломая: пока поле
    // не заведено через админку, всё работает ровно как раньше.
    const { service } = build(null, { MOTIVATION_VIDEO_MODEL: 'из/окружения' });

    await expect(service.read()).resolves.toMatchObject({
      videoModel: 'из/окружения',
    });
  });

  it('без базы и окружения берёт значение из кода', async () => {
    const { service } = build(null);

    await expect(service.read()).resolves.toMatchObject({
      videoModel: SETTINGS_FALLBACK.videoModel,
      dailyBudgetUsd: SETTINGS_FALLBACK.dailyBudgetUsd,
    });
  });

  it('пустая строка из формы возвращает наследование, а не пустую модель', async () => {
    // Иначе, очистив поле, администратор получил бы неработающий сервис.
    const { service, saved } = build(null);

    await service.update('admin', { videoModel: '   ' });

    expect(saved[0].videoModel).toBeNull();
  });

  it('ноль и мусор в потолке бюджета не сохраняются', async () => {
    // Нулевой потолок остановил бы генерацию совсем, а это выглядело бы как
    // поломка, а не как настройка.
    const { service, saved } = build(null);

    await service.update('admin', { dailyBudgetUsd: 0 });

    expect(saved[0].dailyBudgetUsd).toBeNull();
  });

  it('менять настройки может только администратор', async () => {
    const { service } = build(null);

    await expect(
      service.update('user', { videoModel: 'чужое/значение' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('секретов не хранит и не отдаёт', async () => {
    // FAL_KEY и доступы к S3 остаются в окружении: их место не в базе и не в
    // интерфейсе.
    const { service } = build(null, { FAL_KEY: 'секрет' });
    const settings = await service.read();

    expect(JSON.stringify(settings)).not.toContain('секрет');
  });
});
