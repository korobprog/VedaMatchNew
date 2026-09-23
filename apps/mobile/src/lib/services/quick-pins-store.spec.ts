import type { ServiceCard } from '@vedamatch/shared';
import { QUICK_PINS_STORAGE_KEY, createQuickPinsStore, type KeyValueStorage } from './quick-pins-store';
import { serializeQuickPins, type QuickPin } from './quick-pins';

/**
 * Хранилище закреплённого: запись, чтение, отказы хранилища. Сам
 * `expo-secure-store` подменён памятью — проверяется то, что делает наша
 * обёртка, а не Keystore.
 */

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage & { data: Map<string, string>; reads: number; writes: number } = {
    data,
    reads: 0,
    writes: 0,
    async getItem(key) {
      storage.reads += 1;
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      storage.writes += 1;
      data.set(key, value);
    },
  };
  return storage;
}

function card(slug: string, name = `Сервис ${slug}`, status: ServiceCard['status'] = 'active'): ServiceCard {
  return {
    id: slug,
    slug,
    name,
    nameEn: null,
    description: '',
    iconUrl: null,
    url: `/${slug}`,
    status,
    category: 'service',
    requiresDevoteeVerification: false,
  };
}

const pin = (slug: string): QuickPin => ({ slug, name: `Сервис ${slug}`, url: `/${slug}` });
const slugs = (pins: readonly QuickPin[]) => pins.map((item) => item.slug);

describe('хранилище закреплённого', () => {
  it('до чтения пусто и «не прочитано»; после — набор с диска', async () => {
    const storage = memoryStorage({ [QUICK_PINS_STORAGE_KEY]: serializeQuickPins([pin('music'), pin('wellness')]) });
    const store = createQuickPinsStore(storage);
    expect(store.get()).toEqual([]);
    expect(store.isLoaded()).toBe(false);
    await store.load();
    expect(store.isLoaded()).toBe(true);
    expect(slugs(store.get())).toEqual(['music', 'wellness']);
  });

  it('хранилище читается один раз, сколько бы экранов ни спросили', async () => {
    const storage = memoryStorage();
    const store = createQuickPinsStore(storage);
    await Promise.all([store.load(), store.load(), store.load()]);
    await store.load();
    expect(storage.reads).toBe(1);
  });

  it('закреплённое пишется на диск и читается новым запуском', async () => {
    const storage = memoryStorage();
    const first = createQuickPinsStore(storage);
    expect(await first.toggle(card('wellness', 'Здоровье'))).toBe('pinned');
    expect(await first.toggle(card('music'))).toBe('pinned');
    await first.move('music', -1);

    const relaunched = createQuickPinsStore(storage);
    await relaunched.load();
    expect(slugs(relaunched.get())).toEqual(['music', 'wellness']);
    expect(relaunched.get()[1].name).toBe('Здоровье');
  });

  it('открепление тоже доезжает до диска', async () => {
    const storage = memoryStorage({ [QUICK_PINS_STORAGE_KEY]: serializeQuickPins([pin('a'), pin('b')]) });
    const store = createQuickPinsStore(storage);
    expect(await store.toggle(card('a'))).toBe('unpinned');
    expect(JSON.parse(storage.data.get(QUICK_PINS_STORAGE_KEY)!)).toEqual([pin('b')]);
  });

  it('правка до чтения сначала дочитывает диск и не затирает прежний выбор', async () => {
    const storage = memoryStorage({ [QUICK_PINS_STORAGE_KEY]: serializeQuickPins([pin('a')]) });
    const store = createQuickPinsStore(storage);
    await store.toggle(card('b'));
    expect(slugs(store.get())).toEqual(['a', 'b']);
  });

  it('шестой не закрепляется и на диск не пишется', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(pin);
    const storage = memoryStorage({ [QUICK_PINS_STORAGE_KEY]: serializeQuickPins(five) });
    const store = createQuickPinsStore(storage);
    expect(await store.toggle(card('f'))).toBe('full');
    expect(storage.writes).toBe(0);
    expect(slugs(store.get())).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('отказ чтения — пустая панель, а не падение', async () => {
    const store = createQuickPinsStore({
      getItem: () => Promise.reject(new Error('keystore')),
      setItem: () => Promise.resolve(),
    });
    await expect(store.load()).resolves.toEqual([]);
    expect(store.isLoaded()).toBe(true);
  });

  it('отказ записи — выбор держится до перезапуска', async () => {
    const store = createQuickPinsStore({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.reject(new Error('keystore')),
    });
    await expect(store.toggle(card('music'))).resolves.toBe('pinned');
    expect(slugs(store.get())).toEqual(['music']);
  });

  it('подписчики узнают о чтении и о каждой правке, но не о пустых', async () => {
    const store = createQuickPinsStore(memoryStorage());
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load();
    expect(listener).toHaveBeenCalledTimes(1);
    await store.toggle(card('a'));
    expect(listener).toHaveBeenCalledTimes(2);
    await store.move('a', 1); // единственный — сдвигать некуда
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await store.toggle(card('b'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('каталог освежает имена и убирает ушедшее, запись — только при разнице', async () => {
    const storage = memoryStorage({ [QUICK_PINS_STORAGE_KEY]: serializeQuickPins([pin('music'), pin('astro')]) });
    const store = createQuickPinsStore(storage);
    await store.reconcile([card('music', 'Медиатека'), card('astro', 'Астро', 'coming_soon')]);
    expect(store.get()).toEqual([{ slug: 'music', name: 'Медиатека', url: '/music' }]);
    expect(storage.writes).toBe(1);
    await store.reconcile([card('music', 'Медиатека')]);
    expect(storage.writes).toBe(1);
  });
});
