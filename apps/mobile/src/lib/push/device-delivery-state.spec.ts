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
      registration: 'no-permission',
      status: alive,
      statusFailed: false,
    });

    expect(section.kind).toBe('no-permission');
    expect(section.action).toBe('settings');
    expect(section.actionLabel).toBe('Открыть настройки');
    expect(section.hint).toContain('Откройте настройки уведомлений');
    expect(section.tone).toBe('warn');
  });

  it('разрешение важнее ответа сервера: живая точка другого устройства не повод обещать пуши здесь', () => {
    expect(
      describeDeviceDelivery({
        registration: 'no-permission',
        status: { ...alive, app: 2 },
        statusFailed: false,
      }).kind,
    ).toBe('no-permission');
  });

  it('сборка без google-services.json — объясняем, что кнопкой это не лечится', () => {
    const section = describeDeviceDelivery({
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
      registration: 'registered',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.hint).toContain('пока не числит его живой точкой');
  });

  it('про телефон ничего не известно, точек нет — говорим, что ключ не дошёл', () => {
    const section = describeDeviceDelivery({
      registration: 'unknown',
      status: nothing,
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.hint).toContain('ключ доставки до него не дошёл');
  });

  it('уведомления идут в браузер и Telegram — называем их, иначе «некуда» звучит страшнее правды', () => {
    const section = describeDeviceDelivery({
      registration: 'failed',
      status: { ...nothing, web: 1, telegram: 1, reachable: true },
      statusFailed: false,
    });

    expect(section.kind).toBe('unreachable');
    expect(section.hint).toContain('в браузер и в Telegram');
    expect(section.hint).toContain('но не на этот телефон');
  });

  it('помеченные мёртвыми подписки браузера упоминаются отдельно', () => {
    const section = describeDeviceDelivery({
      registration: 'failed',
      status: { ...nothing, stale: 2 },
      statusFailed: false,
    });

    expect(section.hint).toContain('пометил мёртвыми');
  });

  it('в каждом плохом исходе напоминаем, что переписка работает и без пушей', () => {
    const bad = (['no-permission', 'no-token', 'failed'] as const).map((registration) =>
      describeDeviceDelivery({ registration, status: nothing, statusFailed: false }),
    );

    for (const section of bad) {
      expect(section.hint).toContain('работают и без пушей');
    }
  });

  it('у хорошего исхода ни кнопки, ни оправданий', () => {
    const section = describeDeviceDelivery({
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
