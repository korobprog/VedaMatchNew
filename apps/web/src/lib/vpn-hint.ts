/**
 * Догадка «у человека включён VPN» (VED-275).
 *
 * Честно определить VPN из браузера нельзя: расширения и системные туннели
 * страницам не видны, а сравнивать геолокацию с адресом — гадание на кофейной
 * гуще. Поэтому ловим не VPN, а его симптом: портал не работает с включённым
 * туннелем, потому что запросы в API до него не доходят. Значит признак —
 * `fetch` к своему же API, который падает или не укладывается в таймаут,
 * тогда как браузер считает, что сеть есть.
 *
 * Отсюда и формулировки в плашке: «похоже, включён VPN», а не «VPN включён».
 * Тот же симптом даёт упавший API, и обещать человеку причину мы не вправе.
 *
 * Правила, которые здесь живут:
 * - Пришёл ЛЮБОЙ ответ по HTTP — сеть до портала есть. Даже 503 от здоровья
 *   (упал Postgres) значит, что запрос дошёл: это авария портала, а не туннель.
 * - Браузер сам говорит, что сети нет (`navigator.onLine === false`) — это
 *   офлайн, а не VPN. Счётчик обнуляем, чтобы отключённый вайфай сам не набрал
 *   порог за время прогулки по лифту.
 * - Одна неудача ничего не значит: мобильная сеть роняет запросы и без
 *   туннеля. Плашку показываем со второй подряд.
 */

/** Чем закончилась одна проба. */
export type VpnProbeOutcome = "reachable" | "unreachable" | "offline";

export interface VpnProbeInput {
  /** `navigator.onLine` на момент пробы. */
  online: boolean;
  /** HTTP-статус ответа, если ответ вообще пришёл. */
  status?: number | null;
}

/** Сколько ждать ответ здоровья: дольше человек всё равно смотрит на спиннер. */
export const VPN_PROBE_TIMEOUT_MS = 6_000;
/** Как часто перепроверять. Здоровье исключено из троттлинга, но не бесплатно. */
export const VPN_PROBE_INTERVAL_MS = 20_000;
/** Первая проба — не сразу: пусть страница успеет догрузиться. */
export const VPN_PROBE_DELAY_MS = 2_500;
/** Со скольких подряд неудач показываем плашку. */
export const VPN_FAILURE_THRESHOLD = 2;

export interface VpnHintState {
  /** Сколько проб подряд не дошло до портала. */
  failures: number;
  /** Показывать ли плашку. */
  warn: boolean;
}

export const INITIAL_VPN_HINT_STATE: VpnHintState = { failures: 0, warn: false };

/**
 * Что означает результат одной пробы. Статус проверяется раньше `online`:
 * пришедший ответ — доказательство связи, а `navigator.onLine` врёт чаще, чем
 * принято думать (в Safari он остаётся `true` в самолётном режиме).
 */
export function classifyVpnProbe(input: VpnProbeInput): VpnProbeOutcome {
  if (typeof input.status === "number") return "reachable";
  if (!input.online) return "offline";
  return "unreachable";
}

/**
 * Следующее состояние догадки. Плашка гаснет от первого же дошедшего ответа —
 * человек отключил VPN и не должен закрывать предупреждение руками.
 */
export function reduceVpnHint(
  state: VpnHintState,
  outcome: VpnProbeOutcome,
  threshold: number = VPN_FAILURE_THRESHOLD,
): VpnHintState {
  if (outcome === "reachable") return INITIAL_VPN_HINT_STATE;
  // Офлайн ничего не подтверждает и не опровергает: счётчик обнуляем, а уже
  // показанную плашку не убираем — её снимет первый успешный ответ.
  if (outcome === "offline") return { failures: 0, warn: state.warn };
  const failures = state.failures + 1;
  return { failures, warn: failures >= threshold };
}

/**
 * Адрес пробы. `/health` — самый дешёвый эндпоинт API и единственный, который
 * отвечает гостю. Одноразовый параметр обходит кеш прокси и Service Worker:
 * закешированный «ok» сделал бы проверку бессмысленной.
 */
export function buildVpnProbeUrl(base: string, nonce: string | number): string {
  return `${base.replace(/\/+$/, "")}/health?probe=${encodeURIComponent(String(nonce))}`;
}
