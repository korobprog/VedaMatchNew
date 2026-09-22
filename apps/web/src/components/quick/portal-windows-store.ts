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
import { planPortalHistoryStep } from "@/lib/portal-back";
import type { PortalHistoryDirection } from "@/lib/portal-history-seq";

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
/** Идёт возврат на запомненное место — см. `notePortalScroll`. */
let restoring = false;
/** Адрес, который портал сам себе отменил — см. `notePortalNavigation`. */
let ignoreUrl: string | null = null;
/**
 * Последний записанный переход и состояние ДО него — см. `stepPortalHistory`.
 *
 * Роутер Next разбирает `popstate` раньше портала: к моменту, когда до
 * портала доходит сам `popstate`, адрес, куда увёл браузер, уже записан в
 * историю активного окна как обычный переход. Отматываем запись назад, а не
 * спорим за порядок слушателей: он зависит от того, кто раньше подписался, и
 * держать это в голове при следующей правке никто не обязан.
 */
let lastNavigation: { url: string; before: PortalWindowsState } | null = null;

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

/**
 * Записать переход. Повтор того же адреса состояние не трогает.
 *
 * Адрес, с которого портал сам себя увёл после `popstate` (VED-354),
 * пропускается один раз: роутер успевает отрисовать страницу чужого окна до
 * того, как доедет `replace`, и без этого чужой адрес попадал бы в историю
 * активного окна.
 */
export function notePortalNavigation(url: string): void {
  if (!hydrated) return;
  const skip = url === ignoreUrl;
  ignoreUrl = null;
  if (skip) return;
  lastNavigation = { url, before: state };
  set(recordPortalNavigation(state, url));
}

/**
 * Запомнить прокрутку текущей страницы активного окна.
 *
 * Пока идёт возврат на запомненное место, записи не принимаются (VED-325):
 * возврат сам двигает страницу, браузер шлёт события прокрутки, и портал
 * записывал промежуточное положение поверх того, куда как раз и возвращался.
 * На странице, которая грузит содержимое запросом, запомненное место так
 * затиралось нулём ещё до того, как список успевал отрисоваться.
 */
export function notePortalScroll(scroll: number): void {
  if (!hydrated || restoring) return;
  set(rememberPortalScroll(state, scroll));
}

/** Возврат на запомненное место начался/кончился — см. `notePortalScroll`. */
export function setPortalScrollRestoring(active: boolean): void {
  restoring = active;
}

/**
 * Шаг по истории браузера (`popstate`) — аппаратная кнопка «назад» на
 * телефоне (VED-354). Возвращает адрес, на который надо поправить роутер,
 * или `null`, если браузер и так попал куда надо.
 */
export function stepPortalHistory(
  landed: string,
  direction: PortalHistoryDirection = -1,
): string | null {
  if (!hydrated) return null;
  // Роутер Next успел записать адрес, куда увёл браузер, как обычный
  // переход — отматываем эту запись и решаем по состоянию до неё.
  const noted = lastNavigation?.url === landed;
  const base = noted ? lastNavigation!.before : state;
  lastNavigation = null;
  const plan = planPortalHistoryStep(base, landed, direction);
  if (plan.kind === "leave") {
    // Шагать в активном окне некуда: пусть «назад» уводит с портала, как и
    // ожидается на телефоне. Окно, которому принадлежит адрес, становится
    // активным — это записано в самой истории вкладки. А если адрес не
    // принадлежит никому, окно остаётся там, куда увёл браузер: запись уже
    // сделана обычным переходом, и отменять её нечего.
    if (plan.target === null) return null;
    pendingScroll = plan.target;
    set(plan.state);
    return null;
  }
  pendingScroll = plan.target;
  // Если запись уже была и мы её отмотали, пропускать больше нечего.
  ignoreUrl = plan.navigate === null || noted ? null : landed;
  set(plan.state);
  return plan.navigate;
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
  restoring = false;
  ignoreUrl = null;
  lastNavigation = null;
  emit();
}
