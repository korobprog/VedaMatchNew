import type { MotivationFeedAttributionsDto } from "@vedamatch/shared";

/**
 * Память вкладки на списки авторов и источников (VED-252, доработка:
 * «кнопка со значком фильтра открывается с затормаживанием»).
 *
 * Само окно фильтра открывается мгновенно — тормозит не оно, а список
 * внутри: `/motivation/feed/attributions` каждый раз пересчитывает
 * счётчики по всей видимой ленте (две пары запросов с `groupBy`), и до
 * ответа в окне висит «Загружаем…». Раньше запрос уходил из `useEffect`
 * уже открытого окна и начинался заново при каждом открытии — то есть
 * ровно в тот момент, когда ждать дороже всего.
 *
 * Здесь запрос отвязан от окна: его можно начать заранее (наведение,
 * фокус, касание — см. `FeedAttributionFilter`), а ответ переживает
 * закрытие окна, и второе открытие рисует список сразу, без запроса.
 *
 * Правила, из-за которых это модуль, а не `useRef` в компоненте:
 * - Ключ — строка запроса: папка и вкладка сужают списки, и список
 *   «Открыток» нельзя показать в «Ленте».
 * - Один запрос на ключ: наведение, касание и открытие подряд — это
 *   три вызова и один поход в сеть.
 * - Ошибка не кэшируется: следующее открытие пробует снова.
 * - Ответ живёт `TTL_MS`: счётчики меняются, когда в ленте появляется
 *   новое, и вечно показывать вчерашнее число нельзя.
 */

export type AttributionsFetcher = (
  query: string,
) => Promise<MotivationFeedAttributionsDto>;

/** Пять минут: дольше человек в одной ленте фильтр не листает. */
export const TTL_MS = 5 * 60_000;

type Clock = () => number;

const data = new Map<string, { value: MotivationFeedAttributionsDto; at: number }>();
const inFlight = new Map<string, Promise<MotivationFeedAttributionsDto | null>>();

/**
 * Готовый список для этого запроса, если он ещё свежий. Окно вызывает его
 * на первом рисовании: есть ответ — показываем сразу, нет — «Загружаем…».
 */
export function cachedAttributions(
  query: string,
  now: Clock = Date.now,
): MotivationFeedAttributionsDto | null {
  const hit = data.get(query);
  if (!hit) return null;
  if (now() - hit.at >= TTL_MS) {
    data.delete(query);
    return null;
  }
  return hit.value;
}

/**
 * Список для этого запроса: из памяти, из уже идущего запроса или новым
 * запросом. `null` — не получилось; вызвавший решает, показывать ли
 * ошибку (окно показывает, предзагрузка молчит).
 */
export function loadAttributions(
  query: string,
  fetcher: AttributionsFetcher,
  now: Clock = Date.now,
): Promise<MotivationFeedAttributionsDto | null> {
  const fresh = cachedAttributions(query, now);
  if (fresh) return Promise.resolve(fresh);
  const running = inFlight.get(query);
  if (running) return running;
  const request = fetcher(query)
    .then((value) => {
      data.set(query, { value, at: now() });
      return value;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(query);
    });
  inFlight.set(query, request);
  return request;
}

/** Только для тестов: вкладка живёт с одним кэшем, тесты — нет. */
export function resetAttributionsCache(): void {
  data.clear();
  inFlight.clear();
}
