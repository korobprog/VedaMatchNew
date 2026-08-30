/**
 * Запас подписанных адресов записи. См. docs/music-service-plan.md.
 *
 * Обычный путь к звуку стоит двух кругов по сети: запрос к порталу
 * `/music/tracks/:id/stream`, 302 на подписанный адрес, и только потом
 * рукопожатие с хранилищем и первые байты. Пока они идут, кнопка молчит — и
 * молчит она ровно в тот момент, когда человек нажал «дальше» и ждёт музыку.
 *
 * Круг снимается заранее: пока играет текущая запись, портал спрашивает адрес
 * следующей и кладёт сюда. На переключении он уже есть, и `<audio>` идёт прямо
 * в хранилище.
 *
 * Запас в памяти вкладки, а не в `localStorage`: подпись живёт шесть часов, и
 * пережившая перезагрузку ссылка чаще протухшая, чем полезная. Цена промаха —
 * обычный путь через редирект, то есть ровно то, что было раньше.
 */

export interface CachedStreamUrl {
  url: string;
  /** Когда подпись перестаёт действовать, в миллисекундах эпохи. */
  expiresAtMs: number;
}

/**
 * Насколько заранее считать адрес непригодным.
 *
 * Не «пока не истёк»: между выдачей ссылки плееру и последним диапазонным
 * запросом к хранилищу лежит вся запись целиком. Лекция на два часа, начатая
 * по ссылке с пятью минутами жизни, оборвётся на середине — и выглядеть это
 * будет как сбой сети. Получас покрывает почти любую запись каталога, а
 * промах стоит одного лишнего редиректа.
 */
export const STREAM_URL_SAFETY_MARGIN_MS = 30 * 60_000;

/** Сколько адресов держим. Очередь читают вперёд, а не вширь. */
export const STREAM_URL_CACHE_LIMIT = 8;

export function streamUrlExpiresAt(
  expiresInSeconds: number,
  nowMs: number,
): number {
  return nowMs + expiresInSeconds * 1000;
}

export function isStreamUrlUsable(
  entry: CachedStreamUrl | undefined,
  nowMs: number,
): boolean {
  if (!entry) return false;
  return entry.expiresAtMs - nowMs > STREAM_URL_SAFETY_MARGIN_MS;
}

const cache = new Map<string, CachedStreamUrl>();

export function rememberStreamUrl(
  trackId: string,
  url: string,
  expiresInSeconds: number,
  nowMs: number,
): void {
  // Перекладываем в конец: `Map` помнит порядок вставки, и вытеснять надо
  // самое давнее, а не самое недавно пригодившееся.
  cache.delete(trackId);
  cache.set(trackId, { url, expiresAtMs: streamUrlExpiresAt(expiresInSeconds, nowMs) });

  while (cache.size > STREAM_URL_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Годный адрес записи или `null`.
 *
 * Протухшее убираем сразу: держать его значит спрашивать про него снова и
 * снова, каждый раз получая отказ.
 */
export function freshStreamUrl(trackId: string, nowMs: number): string | null {
  const entry = cache.get(trackId);
  if (isStreamUrlUsable(entry, nowMs)) return entry!.url;
  cache.delete(trackId);
  return null;
}

/** Забыть адрес: по нему не заиграло, и второй раз предлагать его незачем. */
export function forgetStreamUrl(trackId: string): void {
  cache.delete(trackId);
}

/** Только для тестов: запас живёт на модуле и переживает отдельный случай. */
export function clearStreamUrlCache(): void {
  cache.clear();
}

export function hasCachedStreamUrl(trackId: string): boolean {
  return cache.has(trackId);
}
