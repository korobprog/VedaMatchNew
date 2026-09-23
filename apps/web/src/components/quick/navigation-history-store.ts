/**
 * Хранилище истории перемещений (VED-392) — на устройстве, в `localStorage`.
 *
 * Не на сервере: это та же раскладка интерфейса, что и набор горячих кнопок,
 * а не данные человека — история телефона и рабочего компьютера разная, и
 * сводить их незачем. Правила записи и группировки — в
 * `lib/navigation-history.ts`; здесь только чтение и запись.
 *
 * Каждое обращение к хранилищу — в try/catch: в приватном режиме или с
 * запрещёнными данными сайта оно бросает, а панель от этого ломаться не
 * должна. Без хранилища история просто не копится.
 */

import {
  parseNavigationHistory,
  recordNavigationVisit,
  serializeNavigationHistory,
  type NavigationHistoryEntry,
} from "@/lib/navigation-history";

export const NAVIGATION_HISTORY_KEY = "vedamatch:navigation-history";

export function readNavigationHistory(): NavigationHistoryEntry[] {
  try {
    return parseNavigationHistory(
      window.localStorage.getItem(NAVIGATION_HISTORY_KEY),
    );
  } catch {
    return [];
  }
}

/** Записать переход. Зовёт трекер переходов на каждую смену адреса. */
export function noteNavigationHistory(url: string, at = Date.now()): void {
  try {
    const current = readNavigationHistory();
    const next = recordNavigationVisit(current, url, at);
    window.localStorage.setItem(
      NAVIGATION_HISTORY_KEY,
      serializeNavigationHistory(next),
    );
  } catch {
    // Хранилище недоступно — история не копится, остальное работает.
  }
}

/**
 * Стереть историю. Кнопкой в самой шторке и при выходе из аккаунта: на
 * общем устройстве следующий вошедший не должен видеть, где ходил прежний.
 */
export function clearNavigationHistory(): void {
  try {
    window.localStorage.removeItem(NAVIGATION_HISTORY_KEY);
  } catch {
    // Нечего стирать, если хранилища нет.
  }
}
