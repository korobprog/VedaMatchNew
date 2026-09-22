import { Platform } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PushBridge } from './push-bridge';
import { pushRegistration, resetPushRegistration, setPushRegistration } from './push-registration';

/**
 * Мост: регистрация при входе и её отмена при выходе (раунд 001, дефект 5).
 *
 * Отмена была потеряна при выносе последовательности в
 * `device-registration.ts`, а тестов на мост не было ни одного — регресс
 * ловить было нечем. Теперь есть.
 */

const mockState = {
  /** Вызовы `registerThisDevice`: api и функция отмены. */
  registrations: [] as { isCancelled: () => boolean }[],
  /** Токены, ушедшие через `onTokenRefresh`. */
  refreshed: [] as string[],
  /** Слушатель обновления токена, чтобы дёрнуть его из теста. */
  rotation: null as ((token: string) => void) | null,
  rotationStopped: 0,
};

jest.mock('./device-registration', () => ({
  CHANNEL_ID: 'messages',
  registerThisDevice: jest.fn(async (_api: unknown, isCancelled: () => boolean = () => false) => {
    mockState.registrations.push({ isCancelled });
    return 'registered';
  }),
  sendDeviceToken: jest.fn(async (_api: unknown, token: string) => {
    mockState.refreshed.push(token);
    return 'registered';
  }),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  onTokenRefresh: jest.fn((_messaging: unknown, handler: (token: string) => void) => {
    mockState.rotation = handler;
    return () => {
      mockState.rotationStopped += 1;
    };
  }),
  onMessage: jest.fn(() => () => undefined),
  onNotificationOpenedApp: jest.fn(() => () => undefined),
  getInitialNotification: jest.fn(async () => null),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: () => undefined })),
  scheduleNotificationAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

jest.mock('@/lib/calls/native-call-bridge', () => ({ handleIncomingCallPush: jest.fn() }));

const session = { status: 'signed' as 'signed' | 'guest', api: {} };
jest.mock('@/lib/auth/session', () => ({ useSession: () => session }));

async function mount(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<PushBridge />);
  });
  return renderer;
}

beforeEach(() => {
  resetPushRegistration();
  mockState.registrations.length = 0;
  mockState.refreshed.length = 0;
  mockState.rotation = null;
  mockState.rotationStopped = 0;
  session.status = 'signed';
  (Platform as { OS: string }).OS = 'android';
});

afterEach(() => {
  (Platform as { OS: string }).OS = 'ios';
});

describe('PushBridge', () => {
  it('вошедшего регистрирует при запуске', async () => {
    await mount();

    expect(mockState.registrations).toHaveLength(1);
    expect(mockState.registrations[0].isCancelled()).toBe(false);
  });

  it('выход из аккаунта отменяет висящую регистрацию', async () => {
    const renderer = await mount();
    const { isCancelled } = mockState.registrations[0];

    await act(async () => renderer.unmount());

    expect(isCancelled()).toBe(true);
    expect(mockState.rotationStopped).toBe(1);
  });

  it('после выхода итог прежнего аккаунта забывается', async () => {
    const renderer = await mount();
    setPushRegistration('registered');

    await act(async () => renderer.unmount());

    expect(pushRegistration()).toBe('unknown');
  });

  it('обновлённый FCM токен уходит на сервер', async () => {
    await mount();

    await act(async () => mockState.rotation?.('token-new'));

    expect(mockState.refreshed).toEqual(['token-new']);
  });

  it('после выхода обновление токена на сервер уже не идёт', async () => {
    const renderer = await mount();
    const rotation = mockState.rotation;
    await act(async () => renderer.unmount());

    await act(async () => rotation?.('token-new'));

    expect(mockState.refreshed).toEqual([]);
  });

  it('гостя не регистрируем: токен привязывается к человеку', async () => {
    session.status = 'guest';

    await mount();

    expect(mockState.registrations).toHaveLength(0);
  });

  it('на iOS мост пуши не регистрирует', async () => {
    (Platform as { OS: string }).OS = 'ios';

    await mount();

    expect(mockState.registrations).toHaveLength(0);
  });
});
