import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import {
  channelStateFrom,
  openMessagesChannelSettings,
  openNotificationSettings,
  readMessagesChannel,
} from './notification-channel';

/**
 * Важность канала «Сообщения» и дорога до его настроек (раунд 001, дефекты
 * 1 и 3). Внешние вызовы подменены: проверяется разбор ответа системы и то,
 * какой именно экран настроек мы открываем.
 */

const mockChannelState = {
  importance: 4 as number | null,
  throws: false,
  intentThrows: false,
  started: [] as { action: string; options?: unknown }[],
  openedAppSettings: 0,
};

jest.mock('expo-notifications', () => ({
  AndroidImportance: { NONE: 0, MIN: 1, DEFAULT: 3, HIGH: 4 },
  getNotificationChannelAsync: jest.fn(async () => {
    if (mockChannelState.throws) throw new Error('нет канала');
    return mockChannelState.importance === null
      ? null
      : { id: 'messages', importance: mockChannelState.importance };
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

jest.mock('./device-registration', () => ({ CHANNEL_ID: 'messages' }));

let openSettings: jest.SpyInstance;

beforeEach(() => {
  openSettings = jest
    .spyOn(Linking, 'openSettings')
    .mockImplementation(async () => {
      mockChannelState.openedAppSettings += 1;
    });
  mockChannelState.importance = 4;
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
  });
});

describe('readMessagesChannel', () => {
  it('спрашивает систему и разбирает ответ', async () => {
    mockChannelState.importance = 0;
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
