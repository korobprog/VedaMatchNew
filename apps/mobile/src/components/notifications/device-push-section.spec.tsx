import { AppState, Platform } from 'react-native';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { NotificationDeliveryStatusDto } from '@vedamatch/shared';
import { DELIVERY_FRESH_MS } from '@/lib/push/device-delivery-state';
import { resetPushRegistration, setPushRegistration } from '@/lib/push/push-registration';
import { DevicePushSection } from './device-push-section';

/**
 * Сборка раздела: чистое правило проверено отдельно
 * (`lib/push/device-delivery-state.spec.ts`), здесь — что компонент
 * действительно спрашивает сервер, показывает нужный текст и что его кнопки
 * делают обещанное.
 */

const mockStatus = jest.fn<Promise<NotificationDeliveryStatusDto>, []>();
const mockRegister = jest.fn(async () => 'registered' as const);
const mockChannel = jest.fn(async () => 'on' as 'on' | 'off' | 'unknown');
/** Категория «Звонки» (VED-361); по умолчанию такая же, как «Сообщения». */
const mockCallsChannel = jest.fn(async () => 'on' as 'on' | 'off' | 'unknown');
const mockOpenCallsChannelSettings = jest.fn(async () => undefined);
const mockOpenSettings = jest.fn(async () => undefined);
const mockOpenChannelSettings = jest.fn(async () => undefined);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    // Настоящий `useFocusEffect` зовёт колбэк, когда экран в фокусе; в тесте
    // экран в фокусе всегда.
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
  };
});

// Объект сессии один на все рендеры: в приложении он приходит из контекста и
// тоже не меняется на каждый кадр.
const fakeSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

jest.mock('@/lib/notifications/delivery-status-api', () => ({
  __esModule: true,
  createDeliveryStatusApi: () => ({ status: () => mockStatus() }),
}));

jest.mock('@/lib/push/device-registration', () => ({
  __esModule: true,
  registerThisDevice: () => mockRegister(),
}));

jest.mock('@/lib/push/notification-channel', () => ({
  __esModule: true,
  readNotificationChannels: async () => ({
    messages: await mockChannel(),
    calls: await mockCallsChannel(),
  }),
  openNotificationSettings: () => mockOpenSettings(),
  openMessagesChannelSettings: () => mockOpenChannelSettings(),
  openCallsChannelSettings: () => mockOpenCallsChannelSettings(),
}));

const nothing: NotificationDeliveryStatusDto = {
  web: 0,
  app: 0,
  telegram: 0,
  stale: 0,
  reachable: false,
};

/** Весь текст, который человек видит на экране, одной строкой. */
function texts(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(renderer.toJSON());
  return found.join(' | ');
}

function button(renderer: ReactTestRenderer): ReactTestInstance | null {
  const found = renderer.root.findAll(
    (node) => node.props?.accessibilityRole === 'button' && typeof node.props?.onPress === 'function',
  );
  return found[0] ?? null;
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<DevicePushSection />);
  });
  return renderer;
}

beforeEach(() => {
  resetPushRegistration();
  mockStatus.mockReset();
  mockRegister.mockClear();
  mockChannel.mockClear();
  mockChannel.mockResolvedValue('on');
  mockCallsChannel.mockClear();
  mockCallsChannel.mockResolvedValue('on');
  mockOpenCallsChannelSettings.mockClear();
  mockOpenSettings.mockClear();
  mockOpenChannelSettings.mockClear();
  // Нативная сборка — Android; на iOS раздел не рисуется вовсе.
  (Platform as { OS: string }).OS = 'android';
});

afterEach(() => {
  (Platform as { OS: string }).OS = 'ios';
});

describe('DevicePushSection', () => {
  it('спрашивает сервер и показывает, что доставка работает', async () => {
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    setPushRegistration('registered');

    const renderer = await render();

    expect(mockStatus).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain('Уведомления доходят до телефона');
    expect(button(renderer)).toBeNull();
  });

  it('точек доставки нет — объясняет и даёт зарегистрировать телефон заново', async () => {
    mockStatus.mockResolvedValue(nothing);
    setPushRegistration('failed');

    const renderer = await render();
    expect(texts(renderer)).toContain('доставлять их некуда');

    const action = button(renderer);
    expect(action).not.toBeNull();
    await act(async () => action?.props.onPress());

    expect(mockRegister).toHaveBeenCalledTimes(1);
    // Повтор регистрации без перечитывания состояния оставил бы человека с
    // прежней руганью на экране, даже когда всё уже починилось.
    expect(mockStatus).toHaveBeenCalledTimes(2);
  });

  it('сервер не ответил — говорит «не удалось проверить» и повторяет по кнопке', async () => {
    mockStatus.mockRejectedValue(new Error('нет сети'));

    const renderer = await render();
    expect(texts(renderer)).toContain('Не удалось проверить доставку');
    expect(texts(renderer)).not.toContain('некуда');

    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    await act(async () => button(renderer)?.props.onPress());

    expect(texts(renderer)).toContain('Уведомления доходят до телефона');
    // Перепроверка состояния регистрацию не трогает: разрешение на месте.
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('нет разрешения — ведёт в системные настройки, сервер при этом не нужен', async () => {
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    setPushRegistration('no-permission');

    const renderer = await render();
    expect(texts(renderer)).toContain('Уведомления запрещены в настройках телефона');

    await act(async () => button(renderer)?.props.onPress());
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockOpenChannelSettings).not.toHaveBeenCalled();
  });

  it('категория «Сообщения» выключена — ведёт прямо в её настройки', async () => {
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    mockChannel.mockResolvedValue('off');
    setPushRegistration('registered');

    const renderer = await render();
    expect(texts(renderer)).toContain('Категория «Сообщения» выключена');
    // VED-361: звонки при этом звонят, и раздел обязан это сказать.
    expect(texts(renderer)).toContain('Звонки при этом продолжат звонить');

    await act(async () => button(renderer)?.props.onPress());
    expect(mockOpenChannelSettings).toHaveBeenCalledTimes(1);
    expect(mockOpenSettings).not.toHaveBeenCalled();
    expect(mockOpenCallsChannelSettings).not.toHaveBeenCalled();
  });

  it('категория «Звонки» выключена — ведёт в её настройки, а не в «Сообщения»', async () => {
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    mockCallsChannel.mockResolvedValue('off');
    setPushRegistration('registered');

    const renderer = await render();
    expect(texts(renderer)).toContain('Категория «Звонки» выключена');
    expect(texts(renderer)).toContain('Сообщения при этом приходят');

    await act(async () => button(renderer)?.props.onPress());
    expect(mockOpenCallsChannelSettings).toHaveBeenCalledTimes(1);
    expect(mockOpenChannelSettings).not.toHaveBeenCalled();
  });

  it('выключены обе категории — ведём на экран уведомлений, где они обе', async () => {
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    mockChannel.mockResolvedValue('off');
    mockCallsChannel.mockResolvedValue('off');
    setPushRegistration('registered');

    const renderer = await render();
    expect(texts(renderer)).toContain('Категории «Сообщения» и «Звонки» выключены');

    await act(async () => button(renderer)?.props.onPress());
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockOpenChannelSettings).not.toHaveBeenCalled();
    expect(mockOpenCallsChannelSettings).not.toHaveBeenCalled();
  });

  it('сборка без ключей Firebase — ни кнопки, ни ложных обещаний', async () => {
    mockStatus.mockResolvedValue(nothing);
    setPushRegistration('no-token');

    const renderer = await render();

    expect(texts(renderer)).toContain('не умеет получать уведомления');
    expect(button(renderer)).toBeNull();
  });

  it('сервер замолчал после удачного ответа — прежнее «всё доходит» с экрана убирается', async () => {
    // Иначе человеку продолжают обещать доставку, про которую приложение уже
    // ничего не знает: ровно то враньё, от которого раздел и заведён.
    let wake: ((state: string) => void) | null = null;
    const listener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_event: string, handler: (state: string) => void) => {
        wake = handler;
        return { remove: () => undefined };
      }) as never);
    mockStatus.mockResolvedValue({ ...nothing, app: 1, reachable: true });
    setPushRegistration('registered');

    const renderer = await render();
    expect(texts(renderer)).toContain('Уведомления доходят до телефона');

    // Прошла минута (ответ устарел), приложение вернулось на передний план, а
    // сервер уже не отвечает.
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DELIVERY_FRESH_MS + 1);
    mockStatus.mockRejectedValue(new Error('нет сети'));
    await act(async () => {
      (wake as unknown as (state: string) => void)?.('active');
    });

    expect(texts(renderer)).not.toContain('Уведомления доходят до телефона');
    expect(texts(renderer)).toContain('Не удалось проверить доставку');

    now.mockRestore();
    listener.mockRestore();
  });

  it('на iOS раздела нет: пуши там пока не регистрируются вовсе', async () => {
    (Platform as { OS: string }).OS = 'ios';
    mockStatus.mockResolvedValue(nothing);

    const renderer = await render();

    expect(renderer.toJSON()).toBeNull();
    expect(mockStatus).not.toHaveBeenCalled();
  });
});
