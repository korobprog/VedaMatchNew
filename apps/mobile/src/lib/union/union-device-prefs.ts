import * as SecureStore from 'expo-secure-store';
import { parseDensity, type GridDensity } from './recommendations-query';

/**
 * Что Знакомства помнят про этот телефон: показаны ли подсказки жестов и
 * сколько колонок у сетки.
 *
 * Свойство устройства, а не человека — как `localStorage` на сайте
 * (`swipe-hint-seen.ts`, `grid-density.ts`): на новом телефоне жест снова
 * показать уместно, экран там другой. Хранилище — `SecureStore`, тем же
 * способом, что видимость блог-ленты и скорость голосовых.
 */

/** Ключ `SecureStore` допускает только `[A-Za-z0-9._-]`. */
export const UNION_PREF_KEYS = {
  swipeHint: 'vm.union.swipeHintSeen',
  photoHint: 'vm.union.photoHintSeen',
  density: 'vm.union.gridDensity',
} as const;

export type UnionHint = 'swipeHint' | 'photoHint';

/** Прочитанное значение флага. Всё, кроме «1», — «не видел»: лишний показ безобиднее пропущенного. */
export function parseSeen(raw: string | null | undefined): boolean {
  return raw === '1';
}

export async function readHintSeen(hint: UnionHint): Promise<boolean> {
  try {
    return parseSeen(await SecureStore.getItemAsync(UNION_PREF_KEYS[hint]));
  } catch {
    return false;
  }
}

export async function rememberHintSeen(hint: UnionHint): Promise<void> {
  try {
    await SecureStore.setItemAsync(UNION_PREF_KEYS[hint], '1');
  } catch {
    // Не запомнили — покажем ещё раз; не повод ронять колоду.
  }
}

export async function readDensity(): Promise<GridDensity> {
  try {
    return parseDensity(await SecureStore.getItemAsync(UNION_PREF_KEYS.density));
  } catch {
    return parseDensity(null);
  }
}

export async function writeDensity(density: GridDensity): Promise<void> {
  try {
    await SecureStore.setItemAsync(UNION_PREF_KEYS.density, String(density));
  } catch {
    // Выбор работает в рамках сеанса и без записи.
  }
}
