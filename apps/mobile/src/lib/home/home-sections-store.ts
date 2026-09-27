import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';
import {
  HOME_SECTIONS_DEFAULT,
  parseHomeSections,
  serializeHomeSections,
  withHomeSection,
  type HomeSectionKey,
  type HomeSections,
} from './home-sections';

/**
 * Где живут галочки главной: на телефоне, в `expo-secure-store` — тем же
 * способом, что панель быстрого доступа (`lib/services/quick-pins-store.ts`)
 * и скорость голосовых. Раскладка экрана — свойство устройства, не данные
 * человека: на сайте у главной свои переключатели в cookie.
 *
 * Ключ один на устройство, без id человека, — в отличие от прежнего
 * «Скрыть ленту» (`vm.blogHome.<id>`). Вкладки ждут чтения этого
 * хранилища, чтобы первый кадр «Чатов» встал сразу с нужными блоками, а при
 * старте без сети профиля ещё нет — ключ с id заставил бы вкладки ждать
 * сети. Прежний ключ не переносится: он хранил только «скрыл» (теперь это
 * умолчание) и редкое «вернул».
 *
 * Здесь же — единственный источник правды для ленты в «Чатах»: кнопка
 * «Скрыть» на полосе, «Вернуть» на экране ленты и галочка в «Настройках»
 * пишут одно и то же поле `blog`.
 */

export const HOME_SECTIONS_STORAGE_KEY = 'vm.homeSections';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface HomeSectionsStore {
  /** Галочки синхронно; до окончания чтения — умолчания. */
  get(): HomeSections;
  isLoaded(): boolean;
  /** Прочитать хранилище один раз; повторные вызовы ждут то же чтение. */
  load(): Promise<HomeSections>;
  set(key: HomeSectionKey, shown: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createHomeSectionsStore(storage: KeyValueStorage): HomeSectionsStore {
  let sections: HomeSections = { ...HOME_SECTIONS_DEFAULT };
  let loaded = false;
  let loading: Promise<HomeSections> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  function load(): Promise<HomeSections> {
    if (loaded) return Promise.resolve(sections);
    if (!loading) {
      // Синхронный отказ нативного модуля (веб, тесты) обязан стать
      // умолчаниями, а не исключением, — иначе вкладки не нарисуются вовсе.
      loading = Promise.resolve()
        .then(() => storage.getItem(HOME_SECTIONS_STORAGE_KEY))
        .then(parseHomeSections, () => ({ ...HOME_SECTIONS_DEFAULT }))
        .then((read) => {
          sections = read;
          loaded = true;
          notify();
          return sections;
        });
    }
    return loading;
  }

  return {
    get: () => sections,
    isLoaded: () => loaded,
    load,
    async set(key, shown) {
      // Ждём чтения: иначе прочитанное затёрло бы только что нажатое.
      await load();
      const next = withHomeSection(sections, key, shown);
      if (next === sections) return;
      sections = next;
      notify();
      try {
        await storage.setItem(HOME_SECTIONS_STORAGE_KEY, serializeHomeSections(next));
      } catch {
        // Выбор действует до перезапуска — не повод не показать его сейчас.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const homeSectionsStore = createHomeSectionsStore({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
});

/** Галочки главной для экрана; первый вызов запускает чтение хранилища. */
export function useHomeSections(store: HomeSectionsStore = homeSectionsStore): HomeSections {
  const sections = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => {
    void store.load();
  }, [store]);
  return sections;
}

/**
 * Прочитано ли хранилище. Вкладки ждут этого вместе с закреплённым панели
 * быстрого доступа: иначе «Чаты» на первом кадре встали бы с умолчаниями, а
 * через кадр блоки появились бы или пропали. Чтение запускается вместе с
 * восстановлением сессии (`root-shell-stack.tsx`).
 */
export function useHomeSectionsLoaded(store: HomeSectionsStore = homeSectionsStore): boolean {
  const loaded = useSyncExternalStore(store.subscribe, store.isLoaded, store.isLoaded);
  useEffect(() => {
    void store.load();
  }, [store]);
  return loaded;
}
