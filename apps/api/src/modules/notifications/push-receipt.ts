/**
 * Подтверждение показа веб-уведомления (VED-327).
 *
 * Сервер знает, что служба доставки браузера ПРИНЯЛА пуш, но не что он дошёл
 * до экрана: браузер, который не открывали месяц, принимает пуш так же, как
 * живой. Поэтому в пуш кладётся квитанция — случайный id отправки и адрес,
 * куда service worker сообщит «показано» после `showNotification`.
 *
 * Адрес едет в самом пуше, потому что sw.js лежит в `public/`, через сборку не
 * проходит и адреса API не знает; у веб-сборки приложения (`ios.vedamatch.com`)
 * API к тому же на другом домене.
 *
 * Чего здесь сознательно нет: отметки о нажатии на уведомление и времени
 * прочтения. Нужен факт показа для диагностики доставки, а не слежка.
 *
 * Чистые функции: отправитель и контроллер только подставляют их результат.
 */

/** Квитанция в пуше: что подтверждать и куда. */
export interface ShowReceipt {
  id: string;
  url: string;
}

/** Разобранная отметка «показано» от service worker. */
export interface ShownReceipt {
  endpoint: string;
  pushId: string;
}

export const SHOWN_RECEIPT_PATH = '/notifications/shown';

/**
 * Адрес подтверждения. Без публичного адреса API квитанцию не кладём вовсе:
 * воркер отправил бы её в никуда, и отсутствие подтверждений читалось бы как
 * «не показано».
 */
export function showReceiptUrl(
  apiPublicUrl: string | undefined,
): string | null {
  if (!apiPublicUrl) return null;
  let url: URL;
  try {
    url = new URL(apiPublicUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  return `${base}${SHOWN_RECEIPT_PATH}`;
}

/** Пуш с квитанцией; без адреса — пуш как был. */
export function withShowReceipt<T extends object>(
  payload: T,
  id: string,
  url: string | null,
): T & { receipt?: ShowReceipt } {
  if (!url) return payload;
  return { ...payload, receipt: { id, url } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Адреса служб доставки — сотни знаков; больше — не подписка, а мусор. */
const MAX_ENDPOINT_LENGTH = 2048;

/**
 * Тело `POST /notifications/shown`. Ручка открыта без входа — у воркера нет
 * ни cookie, ни токена, — поэтому всё, что не похоже на квитанцию, отбрасывается.
 * Подписку называет её `endpoint`: он и так секрет, по которому подписке
 * можно слать пуши, — подделать «показано» по чужому `endpoint` может только
 * тот, кто уже может слать ей пуши.
 */
export function parseShownReceipt(body: unknown): ShownReceipt | null {
  if (!body || typeof body !== 'object') return null;
  const { endpoint, id } = body as { endpoint?: unknown; id?: unknown };
  if (typeof endpoint !== 'string' || typeof id !== 'string') return null;
  if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH)
    return null;
  if (!endpoint.startsWith('https://')) return null;
  if (!UUID.test(id)) return null;
  return { endpoint, pushId: id.toLowerCase() };
}
