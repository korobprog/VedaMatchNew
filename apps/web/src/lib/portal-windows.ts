import { withoutOneShotParams } from "./one-shot-params";

/**
 * Режим нескольких окон портала (VED-118, VED-163).
 *
 * Окно — это отдельный набор состояния навигации внутри одной вкладки
 * браузера: свой текущий адрес и своя история переходов. Переключение
 * мгновенное, и первое окно остаётся там, где его оставили, пока во втором
 * открывают другой сервис.
 *
 * Здесь только модель: состояние, переходы и подпись кнопки. Всё, что
 * связано с реальным роутером и хранилищем, живёт в
 * `components/quick/portal-windows-store.ts` — так правила проверяются
 * тестом, а не открытой вкладкой (см. «Тесты» в CLAUDE.md).
 *
 * Чего модель НЕ обещает: это не вторая вкладка браузера. Восстанавливается
 * адрес и положение прокрутки, а не живой DOM страницы — незаконченная
 * форма или раскрытый список во втором окне переживут переключение только
 * в той мере, в какой их помнит сама страница.
 */

/**
 * Сколько окон бывает. Начинаем с двух, но число не зашито: каждая функция
 * принимает `count`, а перебор идёт по кругу, поэтому третье окно — это
 * правка одной константы и одной кнопки, а не модели.
 */
export const PORTAL_WINDOW_COUNT = 2;

/**
 * Сколько шагов истории помнит одно окно. Глубже не нужно: история окна
 * служит возврату «туда, где я был», а не археологии, зато безграничный
 * список молча растёт в хранилище сессии.
 */
export const PORTAL_WINDOW_HISTORY_LIMIT = 30;

/** Адрес, с которого начинает пустое окно. */
export const PORTAL_WINDOW_HOME = "/";

export interface PortalWindowEntry {
  /** Путь с запросом, как его видит роутер: `/music/artists/1?tab=all`. */
  url: string;
  /** Положение прокрутки на момент ухода из этого адреса. */
  scroll: number;
}

export interface PortalWindow {
  entries: PortalWindowEntry[];
  /** Индекс текущего адреса в `entries`; −1 — окно ещё не открывали. */
  at: number;
}

export interface PortalWindowsState {
  windows: PortalWindow[];
  /** Индекс активного окна: 0 — первое, то самое, что видно после входа. */
  active: number;
}

function emptyWindow(): PortalWindow {
  return { entries: [], at: -1 };
}

export function createPortalWindows(
  url: string,
  count: number = PORTAL_WINDOW_COUNT,
): PortalWindowsState {
  const windows = Array.from({ length: Math.max(1, count) }, emptyWindow);
  windows[0] = { entries: [{ url, scroll: 0 }], at: 0 };
  return { windows, active: 0 };
}

/**
 * Текущий адрес окна; `null` — окно ещё не открывали. Без разового
 * «открой задачу» (VED-500): его могли записать до исправления, а
 * `sessionStorage` вкладки хранит окна и дальше.
 */
export function windowUrl(window: PortalWindow | undefined): string | null {
  if (!window || window.at < 0) return null;
  const url = window.entries[window.at]?.url;
  return url ? withoutOneShotParams(url) : null;
}

export function currentPortalUrl(state: PortalWindowsState): string | null {
  return windowUrl(state.windows[state.active]);
}

/**
 * Записать переход активного окна.
 *
 * Возврат браузерной кнопкой «назад» узнаётся по предыдущему адресу в стеке
 * и двигает указатель, а не плодит третью запись: иначе «назад-вперёд»
 * раздувал бы историю окна на каждом шаге. Любой другой переход обрезает
 * хвост — ровно как ведёт себя история вкладки.
 */
export function recordPortalNavigation(
  state: PortalWindowsState,
  url: string,
  limit: number = PORTAL_WINDOW_HISTORY_LIMIT,
): PortalWindowsState {
  const window = state.windows[state.active] ?? emptyWindow();
  if (windowUrl(window) === url) return state;

  let next: PortalWindow;
  if (window.at > 0 && window.entries[window.at - 1]?.url === url) {
    next = { entries: window.entries, at: window.at - 1 };
  } else if (
    window.at >= 0 &&
    window.entries[window.at + 1]?.url === url
  ) {
    next = { entries: window.entries, at: window.at + 1 };
  } else {
    const kept = window.entries.slice(0, window.at + 1);
    kept.push({ url, scroll: 0 });
    // Переполнение срезаем с головы: старое «где я был час назад» дешевле
    // недавнего.
    const trimmed = kept.length > limit ? kept.slice(kept.length - limit) : kept;
    next = { entries: trimmed, at: trimmed.length - 1 };
  }
  return replaceWindow(state, state.active, next);
}

/** Запомнить, докуда прокручена текущая страница активного окна. */
export function rememberPortalScroll(
  state: PortalWindowsState,
  scroll: number,
): PortalWindowsState {
  const window = state.windows[state.active];
  if (!window || window.at < 0) return state;
  const entry = window.entries[window.at];
  if (!entry || entry.scroll === scroll) return state;
  const entries = [...window.entries];
  entries[window.at] = { ...entry, scroll };
  return replaceWindow(state, state.active, { entries, at: window.at });
}

/**
 * Переключиться на окно `index`. Возвращает и новое состояние, и точку, куда
 * вести роутер: окно, которое ещё не открывали, начинает с главной.
 */
export function switchPortalWindow(
  state: PortalWindowsState,
  index: number,
  count: number = PORTAL_WINDOW_COUNT,
): { state: PortalWindowsState; target: PortalWindowEntry } {
  const size = Math.max(count, state.windows.length);
  const windows = Array.from(
    { length: size },
    (_, i) => state.windows[i] ?? emptyWindow(),
  );
  const active = ((index % size) + size) % size;
  const window = windows[active];
  const target: PortalWindowEntry =
    window.at >= 0
      ? window.entries[window.at]
      : { url: PORTAL_WINDOW_HOME, scroll: 0 };
  if (window.at < 0) {
    windows[active] = { entries: [target], at: 0 };
  }
  return { state: { windows, active }, target };
}

/** Следующее окно по кругу — то, куда ведёт одно нажатие кнопки. */
export function nextPortalWindow(
  state: PortalWindowsState,
  count: number = PORTAL_WINDOW_COUNT,
): number {
  const size = Math.max(1, count);
  return (state.active + 1) % size;
}

/** Человеческий номер окна (1-based) — тот, что стоит в подсказке. */
export function portalWindowNumber(index: number): number {
  return index + 1;
}

/** Адрес, где сейчас стоит окно, куда ведёт кнопка; `null` — его не открывали. */
export function portalWindowTargetUrl(
  state: PortalWindowsState,
  count: number = PORTAL_WINDOW_COUNT,
): string | null {
  return windowUrl(state.windows[nextPortalWindow(state, count)]);
}

/**
 * Подпись кнопки: НАЗВАНИЕ МЕСТА, куда перейдёшь (VED-326). Раньше стоял
 * номер окна, и он не отвечал на единственный вопрос, который у кнопки
 * задают, — «что там осталось». «Работа» или «Знакомства» отвечают, а заодно
 * объясняют, зачем второе окно вообще держат открытым.
 *
 * `label` — как подписать адрес; в портале это `portalLocationLabel` поверх
 * каталога сервисов, в тесте — что угодно.
 */
export function portalWindowButtonLabel(
  state: PortalWindowsState,
  label: (url: string | null) => string,
  count: number = PORTAL_WINDOW_COUNT,
): string {
  return label(portalWindowTargetUrl(state, count));
}

/**
 * То же словами — для скринридера и подсказки. Номера окон остаются здесь:
 * на кнопке они шум, а в объяснении «куда я попаду» — единственное, что
 * отличает два одинаково подписанных места друг от друга.
 */
export function portalWindowButtonHint(
  state: PortalWindowsState,
  label: (url: string | null) => string,
  count: number = PORTAL_WINDOW_COUNT,
): string {
  const to = portalWindowNumber(nextPortalWindow(state, count));
  const from = portalWindowNumber(state.active);
  const there = label(portalWindowTargetUrl(state, count));
  const here = label(windowUrl(state.windows[state.active]));
  return `Перейти в окно ${to}: ${there}. Сейчас окно ${from}: ${here}`;
}

export function serializePortalWindows(state: PortalWindowsState): string {
  return JSON.stringify({ v: 1, ...state });
}

/**
 * Разбор сохранённого состояния. Всё непонятное — молча мимо: в хранилище
 * лежит запись прошлой версии портала, и падать на ней панели незачем.
 * `null` — сохранённого состояния нет, окна собираются заново.
 */
export function parsePortalWindows(
  raw: string | null,
  count: number = PORTAL_WINDOW_COUNT,
): PortalWindowsState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const source = parsed as { windows?: unknown; active?: unknown };
  if (!Array.isArray(source.windows)) return null;

  const size = Math.max(count, source.windows.length);
  const windows = Array.from({ length: size }, (_, i) =>
    parseWindow(source.windows as unknown[], i),
  );
  const active =
    typeof source.active === "number" &&
    Number.isInteger(source.active) &&
    source.active >= 0 &&
    source.active < size
      ? source.active
      : 0;
  return { windows, active };
}

function parseWindow(source: unknown[], index: number): PortalWindow {
  const raw = source[index];
  if (!raw || typeof raw !== "object") return emptyWindow();
  const { entries, at } = raw as { entries?: unknown; at?: unknown };
  if (!Array.isArray(entries)) return emptyWindow();
  const kept: PortalWindowEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { url, scroll } = entry as { url?: unknown; scroll?: unknown };
    // Только внутренние пути: в хранилище сессии мог оказаться чужой адрес,
    // а окно портала — это переход внутри портала.
    if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//"))
      continue;
    kept.push({
      url,
      scroll: typeof scroll === "number" && scroll >= 0 ? scroll : 0,
    });
  }
  if (kept.length === 0) return emptyWindow();
  const position =
    typeof at === "number" && Number.isInteger(at) && at >= 0 && at < kept.length
      ? at
      : kept.length - 1;
  return { entries: kept, at: position };
}

function replaceWindow(
  state: PortalWindowsState,
  index: number,
  window: PortalWindow,
): PortalWindowsState {
  const windows = [...state.windows];
  windows[index] = window;
  return { windows, active: state.active };
}
