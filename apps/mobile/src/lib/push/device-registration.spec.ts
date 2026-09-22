import type { ApiClient } from '@/lib/api/client';
import { registerThisDevice, sendDeviceToken } from './device-registration';
import { pushRegistration, resetPushRegistration } from './push-registration';

/**
 * Итог регистрации — то самое, что человек потом читает в разделе доставки,
 * поэтому пять исходов проверяются здесь, а не «на телефоне посмотрим».
 * Внешние утилиты (разрешение, FCM, запрос на сервер) подменены: проверяется
 * ровно разбор их ответов. Префикс `mock` в именах обязателен — иначе
 * `jest.mock` не даёт ссылаться на переменную из своей фабрики.
 */

const mockPermissions = { granted: false, canAskAgain: true };
const mockState = {
  requestedGranted: false,
  token: 'token-1' as string | null,
  tokenThrows: false,
  sendThrows: false,
  sent: [] as unknown[],
};

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
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
