import type { NotificationDeliveryStatusDto } from '@vedamatch/shared';
import {
  DELIVERY_FRESH_MS,
  describeDeviceDelivery,
  shouldRefreshDelivery,
} from './device-delivery-state';

const nothing: NotificationDeliveryStatusDto = {
  web: 0,
  app: 0,
  telegram: 0,
  stale: 0,
  reachable: false,
};

/** Телефон зарегистрирован и сервер его видит — обычное хорошее состояние. */
const alive: NotificationDeliveryStatusDto = { ...nothing, app: 1, reachable: true };

describe('describeDeviceDelivery', () => {
  it('нет разрешения Android — зовём в системные настройки, а не пугаем', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'no-permission',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('no-permission');
    expect(section.action).toBe('settings');
    expect(section.actionLabel).toBe('Открыть настройки уведомлений');
    expect(section.hint).toContain('Откройте настройки уведомлений VedaMatch');
    expect(section.tone).toBe('warn');
  });

  it('разрешение важнее ответа сервера: живая точка другого устройства не повод обещать пуши здесь', () => {
    expect(
      describeDeviceDelivery({
        channel: 'on',
        registration: 'no-permission',
        status: { ...alive, app: 2 },
        statusFailed: false,
      }).kind,
    ).toBe('no-permission');
  });

  it('категория «Сообщения» выключена — сервер доставляет, а Android прячет', () => {
    // Найдено на живом телефоне (раунд 001, снимок ved329-06): разрешение
    // приложения на месте, точка доставки живая — и ни одного уведомления.
    const section = describeDeviceDelivery({
      channel: 'off',
      registration: 'registered',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('channel-off');
    expect(section.title).toBe('Категория «Сообщения» выключена');
    expect(section.action).toBe('channel-settings');
    expect(section.actionLabel).toBe('Открыть категорию «Сообщения»');
    expect(section.tone).toBe('warn');
    expect(section.hint).toContain('категорию «Сообщения»');
  });

  it('про канал ничего не известно — молчим о нём: «не знаем» не повод пугать', () => {
    expect(
      describeDeviceDelivery({
        channel: 'unknown',
        registration: 'registered',
        status: alive,
        statusFailed: false,
      }).kind,
    ).toBe('ok');
  });

  it('запрет приложения важнее выключенной категории: чинить надо с него', () => {
    expect(
      describeDeviceDelivery({
        channel: 'off',
        registration: 'no-permission',
        status: alive,
        statusFailed: false,
      }).kind,
    ).toBe('no-permission');
  });

  it('ключ ЭТОГО телефона не дошёл, а другое устройство живо — не обещаем доставку сюда', () => {
    // `status.app` считает все живые телефоны аккаунта, а не этот: второй
    // телефон человека оправдывал бы обещание, которое к телефону в руках
    // отношения не имеет (раунд 001, дефект 2).
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'failed',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('not-this-phone');
    expect(section.title).toBe('Этот телефон уведомления не получит');
    expect(section.hint).toContain('на другие ваши устройства');
    expect(section.action).toBe('retry');
  });

  it('ключ не дошёл и других точек нет — это уже «доставлять некуда»', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'failed',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.title).toContain('некуда');
    expect(section.hint).not.toContain('на другие ваши устройства');
  });

  it('сборка без google-services.json — объясняем, что кнопкой это не лечится', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'no-token',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('no-token');
    expect(section.action).toBe('none');
    expect(section.actionLabel).toBeNull();
    expect(section.hint).toContain('ключей службы доставки');
    expect(section.hint).toContain('Telegram');
  });

  it('ответа сервера ещё нет — «проверяем», без обещаний и без ругани', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'unknown',
      status: null,
      statusFailed: false,
    });

    expect(section.kind).toBe('checking');
    expect(section.action).toBe('none');
    expect(section.tone).toBe('muted');
  });

  it('сервер не ответил — не знаем, значит не пугаем: правило с сайта', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'registered',
      status: null,
      statusFailed: true,
    });

    expect(section.kind).toBe('unknown');
    expect(section.action).toBe('recheck');
    expect(section.actionLabel).toBe('Проверить снова');
    expect(section.tone).toBe('muted');
    expect(section.title).not.toContain('некуда');
  });

  it('точка доставки живая и зарегистрирована этим телефоном — говорим прямо про него', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'registered',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('ok');
    expect(section.tone).toBe('ok');
    expect(section.action).toBe('none');
    expect(section.hint).toContain('Этот телефон зарегистрирован');
  });

  it('телефон у сервера есть, но регистрации в этом запуске не было — обещаем осторожнее', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'unknown',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('ok');
    expect(section.hint).toContain('Сервер видит телефон');
    expect(section.hint).not.toContain('Этот телефон зарегистрирован');
  });

  it('токен не дошёл до сервера — виним связь и предлагаем повтор', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'failed',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.action).toBe('retry');
    expect(section.actionLabel).toBe('Зарегистрировать заново');
    expect(section.hint).toContain('не было связи');
    expect(section.hint).toContain('Зарегистрировать заново');
  });

  it('токен ушёл, а сервер точки не видит — повтор регистрации снимает пометку', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'registered',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.hint).toContain('пока не числит его живой точкой');
  });

  it('про телефон ничего не известно, точек нет — говорим, что ключ не дошёл', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'unknown',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.hint).toContain('ключ доставки до него не дошёл');
  });

  it('уведомления идут в браузер и Telegram — называем их, иначе «некуда» звучит страшнее правды', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'failed',
      status: { ...nothing, web: 1, telegram: 1, reachable: true },
      statusFailed: false,
    });

    // Живые точки есть, значит «некуда» — неправда: заголовок про этот телефон.
    expect(section.kind).toBe('not-this-phone');
    expect(section.title).toBe('Этот телефон уведомления не получит');
    expect(section.hint).toContain('в браузер и в Telegram');
    expect(section.hint).toContain('но не на этот телефон');
  });

  it('помеченные мёртвыми подписки браузера упоминаются отдельно', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'failed',
      status: { ...nothing, stale: 2 },
      statusFailed: false,
    });

    expect(section.hint).toContain('пометил мёртвыми');
  });

  it('одна мёртвая подписка — тоже повод сказать: это самый частый случай', () => {
    // Граница `stale > 0`: с единственной мёртвой подписки всё и начинается.
    expect(
      describeDeviceDelivery({
        channel: 'on',
        registration: 'failed',
        status: { ...nothing, stale: 1 },
        statusFailed: false,
      }).hint,
    ).toContain('пометил мёртвыми');
  });

  it('мёртвых нет — про них и не заговариваем', () => {
    expect(
      describeDeviceDelivery({
        channel: 'on',
        registration: 'failed',
        status: nothing,
        statusFailed: false,
      }).hint,
    ).not.toContain('пометил мёртвыми');
  });

  it('в каждом плохом исходе напоминаем, что переписка работает и без пушей', () => {
    const bad = (['no-permission', 'no-token', 'failed'] as const).map((registration) =>
      describeDeviceDelivery({ registration, channel: 'on', status: nothing, statusFailed: false }),
    );
    bad.push(
      describeDeviceDelivery({
        channel: 'off',
        registration: 'registered',
        status: alive,
        statusFailed: false,
      }),
    );

    for (const section of bad) {
      expect(section.hint).toContain('работают и без пушей');
    }
  });

  it('у хорошего исхода ни кнопки, ни оправданий', () => {
    const section = describeDeviceDelivery({
      channel: 'on',
      registration: 'registered',
      status: alive,
      statusFailed: false,
    });

    expect(section.actionLabel).toBeNull();
    expect(section.hint).not.toContain('работают и без пушей');
  });
});

describe('shouldRefreshDelivery', () => {
  it('нажатие кнопки и возврат из настроек — всегда свежий запрос', () => {
    expect(shouldRefreshDelivery({ reason: 'manual', checkedAt: Date.now(), now: Date.now() })).toBe(
      true,
    );
  });

  it('первый заход — спрашиваем', () => {
    expect(shouldRefreshDelivery({ reason: 'focus', checkedAt: null, now: 1_000 })).toBe(true);
  });

  it('свежий ответ — сервер не трогаем: раздел листают туда-сюда', () => {
    expect(
      shouldRefreshDelivery({
        reason: 'focus',
        checkedAt: 1_000,
        now: 1_000 + DELIVERY_FRESH_MS - 1,
      }),
    ).toBe(false);
  });

  it('ответ устарел — обновляемся и на обычном заходе', () => {
    expect(
      shouldRefreshDelivery({ reason: 'foreground', checkedAt: 1_000, now: 1_000 + DELIVERY_FRESH_MS }),
    ).toBe(true);
  });
});
