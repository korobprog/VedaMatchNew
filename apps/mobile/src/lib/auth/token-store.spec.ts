jest.mock('expo-secure-store', () => {
  const mockStore = new Map<string, string>();
  return {
    __mockStore: mockStore,
    getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  };
});

import * as SecureStore from 'expo-secure-store';
import { clearTokens, readTokens, writeTokens } from './token-store';

type MockedSecureStore = typeof SecureStore & {
  __mockStore: Map<string, string>;
};

const mocked = SecureStore as MockedSecureStore;

describe('token-store', () => {
  beforeEach(() => {
    mocked.__mockStore.clear();
    jest.clearAllMocks();
  });

  it('writeTokens() пишет пару, readTokens() читает её обратно', async () => {
    await writeTokens({ accessToken: 'a', refreshToken: 'r' });
    await expect(readTokens()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('пары нет (свежая установка) — readTokens() отдаёт null', async () => {
    await expect(readTokens()).resolves.toBeNull();
  });

  it('clearTokens() стирает обе записи', async () => {
    await writeTokens({ accessToken: 'a', refreshToken: 'r' });
    await clearTokens();
    await expect(readTokens()).resolves.toBeNull();
  });

  it('только один из двух ключей записан (повреждённое хранилище) — тоже null, не половина пары', async () => {
    await mocked.setItemAsync('vm.accessToken', 'a');
    await expect(readTokens()).resolves.toBeNull();
  });

  it('SecureStore.getItemAsync падает (ошибка Keystore) — readTokens() не бросает, отдаёт null и предупреждает в лог', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (mocked.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Keystore недоступен'));

    await expect(readTokens()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const [, detail] = warn.mock.calls[0] as [string, string];
    expect(detail).toContain('Keystore недоступен');
    warn.mockRestore();
  });
});
