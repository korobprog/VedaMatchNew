import * as SecureStore from 'expo-secure-store';
import { UNION_PREF_KEYS, parseSeen, readDensity, readHintSeen, rememberHintSeen, writeDensity } from './union-device-prefs';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
});

describe('настройки Знакомств на телефоне', () => {
  it('ключи годятся для SecureStore', () => {
    for (const key of Object.values(UNION_PREF_KEYS)) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('флаг подсказки — только «1», остальное «не видел»', () => {
    expect(parseSeen('1')).toBe(true);
    expect(parseSeen('true')).toBe(false);
    expect(parseSeen(null)).toBe(false);
  });

  it('подсказки запоминаются порознь', async () => {
    await rememberHintSeen('swipeHint');
    expect(await readHintSeen('swipeHint')).toBe(true);
    expect(await readHintSeen('photoHint')).toBe(false);
  });

  it('сломанное хранилище не роняет колоду: подсказка покажется ещё раз', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    expect(await readHintSeen('swipeHint')).toBe(false);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    await expect(rememberHintSeen('photoHint')).resolves.toBeUndefined();
  });

  it('плотность сетки переживает перезапуск', async () => {
    expect(await readDensity()).toBe(2);
    await writeDensity(3);
    expect(await readDensity()).toBe(3);
  });
});
