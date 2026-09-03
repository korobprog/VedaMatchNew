import { ServiceUnavailableException } from '@nestjs/common';
import { PersonalDataService } from './personal-data.service';

const record = {
  id: 'u1',
  email: 'ivan@yandex.ru',
  name: 'Иван',
  spiritualName: null,
  birthDate: null,
  gender: null,
  avatarKey: null,
  photoKeys: [],
};

/** Мокает московский клиент и записывает порядок вызовов в общий журнал. */
function make(options: { enabled?: boolean; moscowFails?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const log: string[] = [];
  const upsert = jest.fn(async (_args: unknown) => {
    log.push('москва');
    if (options.moscowFails) throw new Error('соединение оборвано');
  });
  const update = jest.fn(async (_args: unknown) => {
    log.push('отметка');
  });
  const ru = {
    isEnabled: enabled,
    get db() {
      if (!enabled) throw new Error('не включён');
      return { personalRecord: { upsert, update } };
    },
  };
  return { service: new PersonalDataService(ru as never), log, upsert, update };
}

describe('PersonalDataService.write', () => {
  it('для ru пишет в Москву РАНЬШЕ Амстердама', async () => {
    const { service, log } = make();

    await service.write({ residency: 'ru', record }, async () => {
      log.push('амстердам');
    });

    // Именно порядок делает схему законной: первая запись обязана произойти
    // в России. Проверяется последовательностью, а не фактом вызова.
    expect(log).toEqual(['москва', 'амстердам', 'отметка']);
  });

  it('для global московский клиент не трогается вовсе', async () => {
    const { service, log, upsert, update } = make();

    await service.write({ residency: 'global', record }, async () => {
      log.push('амстердам');
    });

    expect(log).toEqual(['амстердам']);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('выключенный контур не закрывает регистрацию россиянину', async () => {
    // До включения контура амстердамская запись — единственный рабочий путь.
    // Отказ здесь означал бы, что выкат кода закрыл вход через Яндекс всем.
    const { service, log, upsert } = make({ enabled: false });

    await service.write({ residency: 'ru', record }, async () => {
      log.push('амстердам');
    });

    expect(log).toEqual(['амстердам']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('включённый контур с недоступной Москвой — отказ, и мимо контура не пишем', async () => {
    const { service, log } = make({ moscowFails: true });

    await expect(
      service.write({ residency: 'ru', record }, async () => {
        log.push('амстердам');
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // Главное: амстердамской записи не случилось. Тихий проход мимо Москвы
    // при включённом контуре незаметен и неисправим задним числом.
    expect(log).toEqual(['москва']);
  });

  it('Москва прошла, Амстердам упал — отметка о копии не ставится', async () => {
    const { service, log, update } = make();

    await expect(
      service.write({ residency: 'ru', record }, async () => {
        log.push('амстердам');
        throw new Error('амстердам недоступен');
      }),
    ).rejects.toThrow(/амстердам недоступен/);

    expect(log).toEqual(['москва', 'амстердам']);
    // copiedAt остаётся null — досылка подберёт запись фоном.
    expect(update).not.toHaveBeenCalled();
  });

  it('возвращает результат амстердамской записи как есть', async () => {
    const { service } = make();

    await expect(
      service.write({ residency: 'global', record }, async () => 'готово'),
    ).resolves.toBe('готово');
  });

  it('данные рождения уезжают вложенной записью, а не отдельным обращением', async () => {
    const { service, upsert } = make();
    const birth = {
      bornAtUtc: new Date('1990-05-17T06:00:00Z'),
      birthDateLocal: new Date('1990-05-17'),
      birthTimeLocal: '09:00',
      placeLabel: 'Москва',
      latitude: 55.75,
      longitude: 37.62,
      timeZone: 'Europe/Moscow',
    };

    await service.write({ residency: 'ru', record, birth }, async () => undefined);

    const arg = upsert.mock.calls[0][0] as unknown as {
      create: { birth?: unknown };
    };
    expect(arg.create.birth).toBeDefined();
  });

  it('правка сбрасывает отметку о копии', async () => {
    const { service, upsert } = make();

    await service.write({ residency: 'ru', record }, async () => undefined);

    const arg = upsert.mock.calls[0][0] as unknown as {
      update: { copiedAt: Date | null };
    };
    expect(arg.update.copiedAt).toBeNull();
  });
});
