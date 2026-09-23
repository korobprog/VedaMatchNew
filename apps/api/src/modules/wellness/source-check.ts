/**
 * Проверка источников, которые назвал ИИ (VED-384), — без сети.
 *
 * ИИ может назвать страницу, которую не открывал, или открыть не ту: в живой
 * пробе на Nutella он сослался на главную страницу сайта штрихкодов и на её
 * документацию — ни там, ни там товара нет. Поэтому словам ИИ об источнике
 * мы не верим: страницу открывает наш сервер и сам ищет на ней штрихкод и
 * слова состава. Здесь — чистая часть этой проверки: какие адреса вообще
 * можно открывать, как из HTML достать текст и что считать «штрихкод есть».
 */

export type FetchUrlRejection =
  | 'malformed'
  | 'scheme_not_allowed'
  | 'credentials'
  | 'port_not_allowed'
  | 'ip_literal'
  | 'internal_name';

/** Больше трёх пересылок — петля либо сайт, который нас не ждёт. */
export const SOURCE_MAX_REDIRECTS = 3;
/** Страница товара весит килобайты; мегабайты — это уже не она. */
export const SOURCE_MAX_BYTES = 1_500_000;
/** Сколько страниц сервер открывает на одну карточку. */
export const SOURCE_MAX_PAGES = 4;
/** Доля слов состава, которая должна найтись на странице. */
export const INGREDIENTS_ON_PAGE_MIN = 0.7;

/**
 * Можно ли серверу идти по адресу, который принёс ИИ.
 *
 * Это SSRF-ворота: адрес пришёл из ответа модели, а модель пересказывает
 * чужие страницы. Литеральные IP запрещены целиком — у страницы товара всегда
 * есть имя, а разбирать все записи адреса (`0x7f.1`, `[::ffff:a00:1]`) ради
 * случая, которого не бывает, незачем. Имя, ведущее внутрь, закрывает
 * резолвер загрузчика по `isPublicAddress` — на каждой пересылке.
 */
export function checkFetchUrl(raw: string): FetchUrlRejection | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'malformed';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'scheme_not_allowed';
  }
  if (url.username || url.password) return 'credentials';
  if (url.port && url.port !== '443' && url.port !== '80') {
    return 'port_not_allowed';
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host) return 'malformed';
  if (host.startsWith('[') || /^[0-9.]+$/.test(host) || /^0x/i.test(host)) {
    return 'ip_literal';
  }
  if (!host.includes('.')) return 'internal_name';
  if (
    host === 'localhost' ||
    /\.(localhost|local|internal|lan|home|corp)$/.test(host)
  ) {
    return 'internal_name';
  }
  return null;
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? +part : -1));
  return numbers.every((value) => value >= 0 && value <= 255) ? numbers : null;
}

function isPublicIPv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

/**
 * Публичный ли адрес, который вернул резолвер. Сюда приходят только
 * канонические записи от `dns.lookup`, поэтому разбор короче, чем у
 * загрузчика «Музыки» (`music/ingest-url-guard.ts`), — копия по контракту
 * модуля, а не импорт.
 */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return isPublicIPv4(v4);

  const host = address.toLowerCase().split('%')[0];
  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return false;
  // IPv4 внутри IPv6: ::ffff:10.0.0.1 и NAT64 64:ff9b::10.0.0.1.
  const tail = host.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const embedded = ipv4Parts(tail[1]);
    return embedded ? isPublicIPv4(embedded) : false;
  }
  if (/^::ffff:/.test(host) || /^64:ff9b:/.test(host)) return false;
  // 6to4 несёт адрес шлюза внутри — проще не ходить туда вовсе.
  if (host.startsWith('2002:')) return false;
  const first = parseInt(host.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((first & 0xffc0) === 0xfec0) return false; // fec0::/10
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8
  return true;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Видимый текст страницы. Скрипты и стили вырезаются целиком: в них тоже
 * бывают цифры, и штрихкод из рекламного счётчика не должен подтверждать
 * товар. Разметка JSON-LD — исключение: магазины кладут в неё `gtin13`, и это
 * самое надёжное место штрихкода на странице.
 */
export function htmlToText(html: string): string {
  return html
    .replace(
      /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
      ' $1 ',
    )
    .replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return ENTITIES[name.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Есть ли на странице этот штрихкод. Цифры, разбитые пробелами или дефисами
 * («4 607017 099360»), склеиваются; соседние цифры запрещены — «46070170993601»
 * это другой номер. UPC-A и тот же код в GTIN-13 с ведущим нулём — один
 * товар.
 */
export function pageMentionsBarcode(text: string, barcode: string): boolean {
  if (!/^\d{8,14}$/.test(barcode)) return false;
  const joined = text.replace(/(\d)[\s\u00a0\-‐–]+(?=\d)/g, '$1');
  const variants = new Set([barcode]);
  if (barcode.length === 12) variants.add(`0${barcode}`);
  if (barcode.length === 13 && barcode.startsWith('0')) {
    variants.add(barcode.slice(1));
  }
  return [...variants].some((code) =>
    new RegExp(`(?<!\\d)${code}(?!\\d)`).test(joined),
  );
}

/** Двухбуквенные зоны, где имя сайта стоит третьим уровнем: shop.com.ru. */
const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac']);

/**
 * Сайт источника — чтобы две страницы одного магазина не сошли за два
 * независимых подтверждения. Приближение без списка публичных суффиксов:
 * последние две метки, три — для зон вроде `.com.ru` и `.co.uk`.
 */
export function sourceSite(raw: string): string | null {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    return null;
  }
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return null;
  const take =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    SECOND_LEVEL.has(labels[labels.length - 2])
      ? 3
      : 2;
  return labels.slice(-take).join('.');
}

/**
 * Главная страница сайта — не источник о товаре. Именно такую ИИ и выдал в
 * пробе за подтверждение.
 */
export function isSiteRoot(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.pathname === '/' || url.pathname === '') && !url.search;
  } catch {
    return true;
  }
}

/** Адрес без якоря и завершающего слеша — чтобы сверять с журналом поиска. */
export function comparableUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = '';
    // Метки рекламных кампаний добавляет поиск; к странице они не относятся.
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
