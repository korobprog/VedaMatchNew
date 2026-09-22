"use client";

import { useSyncExternalStore } from "react";
import {
  createPortalWindows,
  currentPortalUrl,
  parsePortalWindows,
  recordPortalNavigation,
  rememberPortalScroll,
  serializePortalWindows,
  switchPortalWindow,
  type PortalWindowEntry,
  type PortalWindowsState,
  PORTAL_WINDOW_COUNT,
} from "@/lib/portal-windows";

/**
 * Живое состояние окон портала (VED-118): модуль-одиночка поверх чистой
 * модели из `lib/portal-windows.ts`.
 *
 * Не React-контекст: панель горячих кнопок живёт в шапке, а следящий за
 * переходами компонент — в корневом layout, и провайдер пришлось бы
 * протягивать через оба дерева. Одиночка с подпиской работает одинаково из
 * любой точки портала.
 *
 * Хранилище — `sessionStorage`, а не `localStorage`: окна принадлежат этой
 * вкладке браузера. Две вкладки с одним `localStorage` толкали бы друг друга
 * по чужой истории, а переживать закрытие вкладки набору открытых окон незачем.
 */
const SESSION_KEY = "vedamatch:portal-windows";

/**
 * Состояние до того, как браузер что-либо рассказал: и сервер, и первая
 * отрисовка видят одно и то же, иначе гидратация расходится.
 */
const INITIAL: PortalWindowsState = Object.freeze(
  createPortalWindows("/"),
) as PortalWindowsState;

let state: PortalWindowsState = INITIAL;
let hydrated = false;

/**
 * Куда прокрутить страницу, когда роутер доедет до адреса переключения.
 * Читает и гасит `PortalWindowsTracker`.
 */
let pendingScroll: PortalWindowEntry | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, serializePortalWindows(state));
  } catch {
    // Приватный режим: окна работают до перезагрузки страницы.
  }
}

function set(next: PortalWindowsState) {
  if (next === state) return;
  state = next;
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): PortalWindowsState {
  return state;
}

function serverSnapshot(): PortalWindowsState {
  return INITIAL;
}

/**
 * Поднять состояние из хранилища вкладки. Зовётся один раз из эффекта
 * трекера: читать хранилище прямо в `getSnapshot` нельзя — это побочный
 * эффект во время отрисовки.
 */
export function hydratePortalWindows(url: string): void {
  if (hydrated) return;
  hydrated = true;
  let restored: PortalWindowsState | null = null;
  try {
    restored = parsePortalWindows(window.sessionStorage.getItem(SESSION_KEY));
  } catch {
    restored = null;
  }
  const base = restored ?? createPortalWindows(url);
  // Адрес, с которого человек начал, принадлежит активному окну: вкладку
  // могли перезагрузить прямо во втором окне.
  set(recordPortalNavigation(base, url));
}

/** Записать переход. Повтор того же адреса состояние не трогает. */
export function notePortalNavigation(url: string): void {
  if (!hydrated) return;
  set(recordPortalNavigation(state, url));
}

/** Запомнить прокрутку текущей страницы активного окна. */
export function notePortalScroll(scroll: number): void {
  if (!hydrated) return;
  set(rememberPortalScroll(state, scroll));
}

/**
 * Переключиться на окно `index`. Возвращает адрес, куда вести роутер, —
 * сам роутер store не трогает: он не знает ни про Next, ни про React.
 */
export function switchPortalWindows(
  index: number,
  scroll: number,
  count: number = PORTAL_WINDOW_COUNT,
): PortalWindowEntry {
  // Нажать кнопку до того, как трекер поднял состояние, в живом портале
  // нельзя (панель в шапке, трекер в корневом layout), но одиночка не должен
  // зависеть от порядка монтирования.
  if (!hydrated) hydratePortalWindows(window.location.pathname);
  const remembered = rememberPortalScroll(state, scroll);
  const { state: next, target } = switchPortalWindow(remembered, index, count);
  pendingScroll = target;
  set(next);
  return target;
}

/**
 * Прокрутка, которую ждёт адрес `url`; `null` — ждать нечего. Гасится
 * первым же вызовом, чтобы не прыгать на следующем переходе.
 */
export function takePendingScroll(url: string): number | null {
  if (!pendingScroll || pendingScroll.url !== url) return null;
  const { scroll } = pendingScroll;
  pendingScroll = null;
  return scroll;
}

export function usePortalWindows(): PortalWindowsState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Текущий адрес активного окна — для отладки и тестов. */
export function activePortalUrl(): string | null {
  return currentPortalUrl(state);
}

/** Только для тестов: вернуть одиночку в исходное состояние. */
export function resetPortalWindowsForTests(): void {
  state = INITIAL;
  hydrated = false;
  pendingScroll = null;
  emit();
}
