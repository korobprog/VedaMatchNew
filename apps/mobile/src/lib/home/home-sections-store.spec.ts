import { HOME_SECTIONS_STORAGE_KEY, createHomeSectionsStore, type KeyValueStorage } from './home-sections-store';

/**
 * Хранилище галочек главной: чтение, запись, отказы. `expo-secure-store`
 * подменён памятью — проверяется обёртка, а не Keystore.
 */

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage & { data: Map<string, string>; reads: number } = {
    data,
    reads: 0,
    async getItem(key) {
      storage.reads += 1;
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
  return storage;
}

describe('хранилище галочек главной', () => {
  it('до чтения — умолчания и «не прочитано»; после — прочитанное', async () => {
    const store = createHomeSectionsStore(memoryStorage({ [HOME_SECTIONS_STORAGE_KEY]: '{"blog":true}' }));
    expect(store.isLoaded()).toBe(false);
    expect(store.get().blog).toBe(false);
    await store.load();
    expect(store.isLoaded()).toBe(true);
    expect(store.get()).toEqual({ quickConference: true, statuses: true, blog: true });
  });

  it('читает хранилище один раз, сколько бы экранов ни спросили', async () => {
    const storage = memoryStorage();
    const store = createHomeSectionsStore(storage);
    await Promise.all([store.load(), store.load(), store.load()]);
    await store.load();
    expect(storage.reads).toBe(1);
  });

  it('галочка сохраняется и сообщает подписчикам', async () => {
    const storage = memoryStorage();
    const store = createHomeSectionsStore(storage);
    const listener = jest.fn();
    store.subscribe(listener);
    await store.set('blog', true);
    expect(store.get().blog).toBe(true);
    expect(JSON.parse(storage.data.get(HOME_SECTIONS_STORAGE_KEY) ?? '{}')).toEqual({
      quickConference: true,
      statuses: true,
      blog: true,
    });
    expect(listener).toHaveBeenCalled();
  });

  it('то же значение ещё раз — без записи и без оповещения', async () => {
    const storage = memoryStorage();
    const store = createHomeSectionsStore(storage);
    await store.load();
    const listener = jest.fn();
    store.subscribe(listener);
    await store.set('blog', false);
    expect(listener).not.toHaveBeenCalled();
    expect(storage.data.has(HOME_SECTIONS_STORAGE_KEY)).toBe(false);
  });

  it('нажатие до окончания чтения не затирается прочитанным', async () => {
    let release!: (value: string | null) => void;
    const read = new Promise<string | null>((resolve) => (release = resolve));
    const storage: KeyValueStorage = {
      getItem: () => read,
      setItem: async () => undefined,
    };
    const store = createHomeSectionsStore(storage);
    const pending = store.set('statuses', false);
    release('{"statuses":true,"blog":true}');
    await pending;
    expect(store.get()).toEqual({ quickConference: true, statuses: false, blog: true });
  });

  it('хранилище не читается — умолчания, вкладки всё равно рисуются', async () => {
    const store = createHomeSectionsStore({
      getItem: () => {
        throw new Error('нет нативного модуля');
      },
      setItem: async () => undefined,
    });
    await expect(store.load()).resolves.toEqual({ quickConference: true, statuses: true, blog: false });
    expect(store.isLoaded()).toBe(true);
  });

  it('запись не удалась — выбор всё равно действует до перезапуска', async () => {
    const store = createHomeSectionsStore({
      getItem: async () => null,
      setItem: async () => {
        throw new Error('keystore');
      },
    });
    await store.set('blog', true);
    expect(store.get().blog).toBe(true);
  });
});
