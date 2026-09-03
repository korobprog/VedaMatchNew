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
function make(options: { configured?: boolean; log?: string[] } = {}) {
  const log = options.log ?? [];
  const upsert = jest.fn(async (_args: unknown) => {
    log.push('москва');
  });
  const update = jest.fn(async () => {
    log.push('отметка');
  });
  const ru = {
    isConfigured: options.configured ?? true,
    get db() {
      if (!(options.configured ?? true)) throw new Error('не настроен');
      return { personalRecord: { upsert, update } };
    },
  };
  const service = new PersonalDataService(ru as never);
  return { service, log, upsert, update };
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

  it('когда контур недоступен, россиянина не пишем мимо контура', async () => {
    const { service, log } = make({ configured: false });

    await expect(
      service.write({ residency: 'ru', record }, async () => {
        log.push('амстердам');
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // Главное: амстердамской записи не случилось. Тихий проход мимо Москвы
    // хуже отказа — он незаметен и неисправим задним числом.
    expect(log).toEqual([]);
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
});
