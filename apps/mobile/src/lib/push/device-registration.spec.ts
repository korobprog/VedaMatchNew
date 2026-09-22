import { getToken } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import type { ApiClient } from '@/lib/api/client';
import {
  CALLS_CHANNEL_ID,
  CHANNEL_ID,
  registerThisDevice,
  sendDeviceToken,
} from './device-registration';
import { pushRegistration, resetPushRegistration } from './push-registration';

/**
 * Итог регистрации — то самое, что человек потом читает в разделе доставки,
 * поэтому пять исходов проверяются здесь, а не «на телефоне посмотрим».
 * Внешние утилиты (разрешение, FCM, запрос на сервер) подменены: проверяется
 * ровно разбор их ответов. Префикс `mock` в именах обязателен — иначе
 * `jest.mock` не даёт ссылаться на переменную из своей фабрики.
 */

const mockPermissions = { granted: false, canAskAgain: true };
const mockEnsureCallChannel = jest.fn();
const mockState = {
  requestedGranted: false,
  token: 'token-1' as string | null,
  tokenThrows: false,
  sendThrows: false,
  sent: [] as unknown[],
};

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, MAX: 5 },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => mockPermissions),
  requestPermissionsAsync: jest.fn(async () => ({ granted: mockState.requestedGranted })),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => {
    if (mockState.tokenThrows) throw new Error('нет google-services.json');
    return mockState.token;
  }),
}));

jest.mock('@/lib/calls/native-call-bridge', () => ({
  ensureCallNotificationChannel: () => mockEnsureCallChannel(),
}));

jest.mock('@/config/app-variant', () => ({
  appVariant: jest.fn(() => ({ contour: 'ru', channel: 'site' })),
}));

jest.mock('./push-api', () => ({
  registerDevice: jest.fn(async (_api: unknown, device: unknown) => {
    if (mockState.sendThrows) throw new Error('нет сети');
    mockState.sent.push(device);
  }),
}));

const api = {} as ApiClient;

beforeEach(() => {
  resetPushRegistration();
  mockPermissions.granted = true;
  mockPermissions.canAskAgain = true;
  mockState.requestedGranted = false;
  mockState.token = 'token-1';
  mockState.tokenThrows = false;
  mockState.sendThrows = false;
  mockState.sent.length = 0;
});

describe('registerThisDevice', () => {
  it('разрешения нет и спросить уже нельзя — «нет разрешения», на сервер не ходим', async () => {
    mockPermissions.granted = false;
    mockPermissions.canAskAgain = false;

    await expect(registerThisDevice(api)).resolves.toBe('no-permission');
    expect(mockState.sent).toHaveLength(0);
    expect(pushRegistration()).toBe('no-permission');
  });

  it('разрешения нет, но человек согласился в окне — идём дальше', async () => {
    mockPermissions.granted = false;
    mockState.requestedGranted = true;

    await expect(registerThisDevice(api)).resolves.toBe('registered');
  });

  it('FCM не отдал токен (сборка без ключей) — «нет токена», а не «нет разрешения»', async () => {
    mockState.tokenThrows = true;

    await expect(registerThisDevice(api)).resolves.toBe('no-token');
    expect(mockState.sent).toHaveLength(0);
  });

  it('пустой токен считается отсутствующим', async () => {
    mockState.token = null;

    await expect(registerThisDevice(api)).resolves.toBe('no-token');
  });

  it('токен есть, а сервер недоступен — «не дошло»: лечится повтором, а не другой сборкой', async () => {
    mockState.sendThrows = true;

    await expect(registerThisDevice(api)).resolves.toBe('failed');
    expect(pushRegistration()).toBe('failed');
  });

  it('удача: токен уходит на сервер тем же контрактом, что и раньше', async () => {
    await expect(registerThisDevice(api)).resolves.toBe('registered');
    expect(mockState.sent[0]).toMatchObject({
      token: 'token-1',
      provider: 'fcm',
      platform: 'android',
      appVariant: 'ru-site',
      nativeCalls: true,
    });
    expect(pushRegistration()).toBe('registered');
  });
});

describe('отмена (выход из аккаунта во время регистрации)', () => {
  it('отменённая попытка на сервер не ходит', async () => {
    await expect(registerThisDevice(api, () => true)).resolves.toBe('unknown');
    expect(mockState.sent).toHaveLength(0);
  });

  it('и итог прежнего аккаунта не записывает', async () => {
    await registerThisDevice(api, () => true);
    expect(pushRegistration()).toBe('unknown');
  });

  it('отмена посреди попытки: на окно разрешения ответили, а слать токен уже поздно', async () => {
    let cancelled = false;
    mockPermissions.granted = false;
    // Человек ответил на системное окно — и тут же вышел из аккаунта.
    (Notifications.requestPermissionsAsync as jest.Mock).mockImplementationOnce(async () => {
      cancelled = true;
      return { granted: true };
    });

    await expect(registerThisDevice(api, () => cancelled)).resolves.toBe('unknown');
    expect(mockState.sent).toHaveLength(0);
  });

  it('отмена во время выдачи токена: токен на руках, но отправлять его уже некому', async () => {
    let cancelled = false;
    // Токен FCM выдаётся не мгновенно — выйти успевают и на этом шаге.
    (getToken as jest.Mock).mockImplementationOnce(async () => {
      cancelled = true;
      return 'token-1';
    });

    await expect(registerThisDevice(api, () => cancelled)).resolves.toBe('unknown');
    expect(mockState.sent).toHaveLength(0);
  });

  it('без отмены всё как раньше', async () => {
    await expect(registerThisDevice(api, () => false)).resolves.toBe('registered');
    expect(mockState.sent).toHaveLength(1);
  });
});

describe('sendDeviceToken', () => {
  it('обновлённый самим FCM токен уходит без повторного запроса разрешения', async () => {
    await expect(sendDeviceToken(api, 'token-2')).resolves.toBe('registered');
    expect(mockState.sent[0]).toMatchObject({ token: 'token-2' });
  });

  it('и его неудача тоже видна разделу доставки', async () => {
    mockState.sendThrows = true;

    await expect(sendDeviceToken(api, 'token-2')).resolves.toBe('failed');
    expect(pushRegistration()).toBe('failed');
  });
});

/**
 * VED-361: каналов два. Пуш в незаведённый канал Android кладёт в служебный
 * `fallback` — без звука звонка и без тумблера, который человек искал бы
 * среди категорий приложения.
 */
describe('категории уведомлений', () => {
  beforeEach(() => {
    // Вызовы копятся на весь файл: здесь важен именно этот запуск.
    jest.mocked(Notifications.setNotificationChannelAsync).mockClear();
    mockEnsureCallChannel.mockClear();
  });

  it('заводит обе: «Сообщения» через expo, «Звонки» — нативным модулем', async () => {
    mockPermissions.granted = true;

    await registerThisDevice({} as ApiClient);

    const created = jest
      .mocked(Notifications.setNotificationChannelAsync)
      .mock.calls.map(([id, options]) => ({ id, name: options.name }));
    expect(created).toEqual([{ id: CHANNEL_ID, name: 'Сообщения' }]);
    // Канал звонков заводит нативная сторона: только там есть системный
    // рингтон и показ на экране блокировки. Создать его здесь попроще
    // означало бы подменить нативное определение худшим — Android оставляет
    // то, что создано первым.
    expect(mockEnsureCallChannel).toHaveBeenCalledTimes(1);
  });

  it('категория «Звонки» заводится до первого звонка, а не при нём', async () => {
    // Раньше канал `calls` создавался в `showIncomingCall`: в системных
    // настройках его не было вовсе, а пуш сервера в этот канал Android клал
    // в служебный `fallback`.
    mockPermissions.granted = true;

    await registerThisDevice({} as ApiClient);

    expect(mockEnsureCallChannel).toHaveBeenCalled();
  });

  it('у канала сообщений прежняя важность: человек мог понизить её сам', async () => {
    mockPermissions.granted = true;

    await registerThisDevice({} as ApiClient);

    const messages = jest
      .mocked(Notifications.setNotificationChannelAsync)
      .mock.calls.find(([id]) => id === CHANNEL_ID);
    expect(messages?.[1].importance).toBe(Notifications.AndroidImportance.HIGH);
  });

  it('идентификаторы совпадают с теми, что шлёт сервер', () => {
    // Строки продублированы в `apps/api/.../notifications/android-channel.ts`:
    // модули не импортируют друг друга, совпадение стережёт этот тест.
    expect(CHANNEL_ID).toBe('messages');
    expect(CALLS_CHANNEL_ID).toBe('calls');
  });
});
