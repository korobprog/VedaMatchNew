import * as SecureStore from 'expo-secure-store';
import { useEffect, useSyncExternalStore } from 'react';
import type { ServiceCard } from '@vedamatch/shared';
import {
  movePin,
  parseQuickPins,
  reconcilePins,
  samePins,
  serializeQuickPins,
  togglePin,
  type QuickPin,
  type TogglePinOutcome,
} from './quick-pins';

/**
 * Где живёт выбор закреплённого (VED-385): на телефоне, в `expo-secure-store`.
 *
 * Почему не на сервере. Сайт хранит свою панель горячих кнопок в
 * `localStorage` и объясняет это в `quick-actions.ts`: раскладка интерфейса —
 * не данные человека, она разная на телефоне и на рабочем компьютере. Здесь
 * к тому же довод сильнее: закрепить на сайте и в приложении нельзя «одно и
 * то же» — на сайте в панели девять действий (калькулятор, донат, афоризм),
 * в приложении — сервисы каталога. Серверная ручка с миграцией синхронизировала
 * бы набор, которому на сайте не с чем совпадать, и потребовала бы нового
 * сервисного модуля ради пяти слагов.
 *
 * Почему `SecureStore`, а не AsyncStorage: второго пакета хранения в
 * приложении нет, и заводить его ради пяти строк незачем — так же живёт
 * выбранная скорость голосовых (`lib/chat/voice/voice-speed-store.ts`).
 * Строка укладывается далеко под предел значения SecureStore (пять
 * записей по ~100 байт).
 *
 * Кэш в памяти — чтобы панель на первом кадре после чтения знала набор
 * синхронно и чтобы «Сервисы» и панель показывали одно и то же без второго
 * похода в хранилище.
 */

export const QUICK_PINS_STORAGE_KEY = 'vm.quickPins';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QuickPinsStore {
  /** Набор синхронно; до окончания чтения — пусто. */
  get(): QuickPin[];
  /** Прочитано ли хранилище: до этого панель не рисуется вовсе. */
  isLoaded(): boolean;
  /** Прочитать хранилище один раз; повторные вызовы ждут то же чтение. */
  load(): Promise<QuickPin[]>;
  toggle(service: Pick<ServiceCard, 'slug' | 'name' | 'url'>): Promise<TogglePinOutcome>;
  move(slug: string, delta: -1 | 1): Promise<void>;
  /** Освежить имена и адреса из каталога и убрать исчезнувшее. */
  reconcile(cards: readonly ServiceCard[]): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createQuickPinsStore(storage: KeyValueStorage): QuickPinsStore {
  let pins: QuickPin[] = [];
  let loaded = false;
  let loading: Promise<QuickPin[]> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  async function commit(next: QuickPin[]): Promise<void> {
    if (samePins(pins, next)) return;
    pins = next;
    notify();
    try {
      await storage.setItem(QUICK_PINS_STORAGE_KEY, serializeQuickPins(next));
    } catch {
      // Выбор остаётся в силе до перезапуска — не повод не показать его сейчас.
    }
  }

  function load(): Promise<QuickPin[]> {
    if (loaded) return Promise.resolve(pins);
    if (!loading) {
      loading = storage
        .getItem(QUICK_PINS_STORAGE_KEY)
        .then(parseQuickPins, () => [] as QuickPin[])
        .then((read) => {
          // Правки (`toggle`/`move`/`reconcile`) сами ждут `load()`, поэтому
          // прочитанное не может затереть свежее действие человека.
          pins = read;
          loaded = true;
          notify();
          return pins;
        });
    }
    return loading;
  }

  return {
    get: () => pins,
    isLoaded: () => loaded,
    load,
    async toggle(service) {
      await load();
      const result = togglePin(pins, service);
      await commit(result.pins);
      return result.outcome;
    },
    async move(slug, delta) {
      await load();
      await commit(movePin(pins, slug, delta));
    },
    async reconcile(cards) {
      await load();
      await commit(reconcilePins(pins, cards));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const quickPinsStore = createQuickPinsStore({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
});

/** Закреплённое для экрана; первый вызов запускает чтение хранилища. */
export function useQuickPins(store: QuickPinsStore = quickPinsStore): QuickPin[] {
  const pins = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => {
    void store.load();
  }, [store]);
  return pins;
}
