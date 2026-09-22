import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import {
  channelStateFrom,
  openCallsChannelSettings,
  openMessagesChannelSettings,
  openNotificationSettings,
  readCallsChannel,
  readMessagesChannel,
  readNotificationChannels,
} from './notification-channel';

/**
 * Важность канала «Сообщения» и дорога до его настроек (раунд 001, дефекты
 * 1 и 3). Внешние вызовы подменены: проверяется разбор ответа системы и то,
 * какой именно экран настроек мы открываем.
 */

const mockChannelState = {
  importance: 6 as number | null,
  /** Важность канала «Звонки»; `undefined` — такая же, как у «Сообщений». */
  callsImportance: undefined as number | null | undefined,
  throws: false,
  intentThrows: false,
  started: [] as { action: string; options?: unknown }[],
  openedAppSettings: 0,
};

jest.mock('expo-notifications', () => ({
  // Значения как в самом `expo-notifications`: перечисление сдвинуто
  // относительно андроидовского (`UNKNOWN = 0`, `NONE = 2`, `HIGH = 6`).
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  getNotificationChannelAsync: jest.fn(async (id: string) => {
    if (mockChannelState.throws) throw new Error('нет канала');
    const importance =
      id === 'calls' && mockChannelState.callsImportance !== undefined
        ? mockChannelState.callsImportance
        : mockChannelState.importance;
    return importance === null ? null : { id, importance };
  }),
}));

jest.mock('expo-intent-launcher', () => ({
  ActivityAction: {
    APP_NOTIFICATION_SETTINGS: 'android.settings.APP_NOTIFICATION_SETTINGS',
    CHANNEL_NOTIFICATION_SETTINGS: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
  },
  startActivityAsync: jest.fn(async (action: string, options?: unknown) => {
    if (mockChannelState.intentThrows) throw new Error('такого экрана нет');
    mockChannelState.started.push({ action, options });
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { android: { package: 'com.vedamatch.app' } } },
}));

jest.mock('./device-registration', () => ({
  CHANNEL_ID: 'messages',
  CALLS_CHANNEL_ID: 'calls',
}));

let openSettings: jest.SpyInstance;

beforeEach(() => {
  openSettings = jest
    .spyOn(Linking, 'openSettings')
    .mockImplementation(async () => {
      mockChannelState.openedAppSettings += 1;
    });
  mockChannelState.importance = 6;
  mockChannelState.callsImportance = undefined;
  mockChannelState.throws = false;
  mockChannelState.intentThrows = false;
  mockChannelState.started.length = 0;
  mockChannelState.openedAppSettings = 0;
});

afterEach(() => openSettings.mockRestore());

describe('channelStateFrom', () => {
  it('важность NONE — категория выключена', () => {
    expect(channelStateFrom(Notifications.AndroidImportance.NONE)).toBe('off');
  });

  it('любая другая важность — включена', () => {
    expect(channelStateFrom(Notifications.AndroidImportance.HIGH)).toBe('on');
    expect(channelStateFrom(Notifications.AndroidImportance.MIN)).toBe('on');
  });

  it('канала ещё нет — «не знаем», а не «выключено»: обвинять человека не в чем', () => {
    expect(channelStateFrom(null)).toBe('unknown');
    expect(channelStateFrom(undefined)).toBe('unknown');
    expect(channelStateFrom(Notifications.AndroidImportance.UNKNOWN)).toBe('unknown');
  });

  it('шкала берётся из expo, а не из Android: ноль там значит «не знаем», а не «выключено»', () => {
    // В документации Android `IMPORTANCE_NONE = 0`, у expo ноль — `UNKNOWN`.
    // Сравнение с нулём вместо константы превратило бы «не знаем» в ругань.
    expect(Notifications.AndroidImportance.NONE).not.toBe(0);
    expect(channelStateFrom(0)).toBe('unknown');
  });
});

describe('readMessagesChannel', () => {
  it('спрашивает систему и разбирает ответ', async () => {
    mockChannelState.importance = 2; // NONE в шкале expo

    await expect(readMessagesChannel()).resolves.toBe('off');
  });

  it('канала нет — «не знаем»', async () => {
    mockChannelState.importance = null;
    await expect(readMessagesChannel()).resolves.toBe('unknown');
  });

  it('спросить не удалось — тоже «не знаем», а не ложная тревога', async () => {
    mockChannelState.throws = true;
    await expect(readMessagesChannel()).resolves.toBe('unknown');
  });
});

describe('экраны настроек', () => {
  it('«Открыть настройки уведомлений» ведёт на уведомления приложения, а не на общую страницу', async () => {
    await openNotificationSettings();

    expect(mockChannelState.started).toEqual([
      {
        action: 'android.settings.APP_NOTIFICATION_SETTINGS',
        options: { extra: { 'android.provider.extra.APP_PACKAGE': 'com.vedamatch.app' } },
      },
    ]);
    expect(mockChannelState.openedAppSettings).toBe(0);
  });

  it('категория «Сообщения» открывается своим экраном и передаёт id канала', async () => {
    await openMessagesChannelSettings();

    expect(mockChannelState.started[0]).toEqual({
      action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
      options: {
        extra: {
          'android.provider.extra.APP_PACKAGE': 'com.vedamatch.app',
          'android.provider.extra.CHANNEL_ID': 'messages',
        },
      },
    });
  });

  it('интент не открылся — отступаем на общую страницу приложения: лучше не туда, чем никуда', async () => {
    mockChannelState.intentThrows = true;

    await openNotificationSettings();
    expect(mockChannelState.openedAppSettings).toBe(1);

    await openMessagesChannelSettings();
    expect(mockChannelState.openedAppSettings).toBe(2);
  });
});

/**
 * VED-361: категорий две, и человек выключает их порознь. Приложение обязано
 * спрашивать про обе и вести в настройки той, которая молчит.
 */
describe('две категории', () => {
  it('читает «Сообщения» и «Звонки» по отдельности', async () => {
    mockChannelState.importance = 6; // HIGH
    mockChannelState.callsImportance = 2; // NONE

    await expect(readMessagesChannel()).resolves.toBe('on');
    await expect(readCallsChannel()).resolves.toBe('off');
  });

  it('обе разом — ровно то, чем раздел доставки описывает систему', async () => {
    mockChannelState.importance = 2;
    mockChannelState.callsImportance = 7;

    await expect(readNotificationChannels()).resolves.toEqual({
      messages: 'off',
      calls: 'on',
    });
  });

  it('категория «Звонки» открывается своим экраном и своим id канала', async () => {
    await openCallsChannelSettings();

    expect(mockChannelState.started[0]).toEqual({
      action: 'android.settings.CHANNEL_NOTIFICATION_SETTINGS',
      options: {
        extra: {
          'android.provider.extra.APP_PACKAGE': 'com.vedamatch.app',
          'android.provider.extra.CHANNEL_ID': 'calls',
        },
      },
    });
  });

  it('экраны категорий не путаются между собой', async () => {
    await openMessagesChannelSettings();
    await openCallsChannelSettings();

    const ids = mockChannelState.started.map(
      (call) =>
        (call.options as { extra: Record<string, string> }).extra[
          'android.provider.extra.CHANNEL_ID'
        ],
    );
    expect(ids).toEqual(['messages', 'calls']);
  });

  it('интент категории «Звонки» не открылся — отступаем на общую страницу', async () => {
    mockChannelState.intentThrows = true;

    await openCallsChannelSettings();

    expect(mockChannelState.openedAppSettings).toBe(1);
  });
});
