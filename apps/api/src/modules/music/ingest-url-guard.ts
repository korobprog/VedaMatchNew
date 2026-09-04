/**
 * Можно ли редакции ходить по этому адресу за файлом.
 *
 * Ручка «добавить по ссылке» даёт админу заставить наш собственный сервер
 * сделать запрос — то есть SSRF. Изнутри контура доступно то, чего нет
 * снаружи: метаданные облака на `169.254.169.254`, Postgres на `127.0.0.1`,
 * соседние контейнеры в `10/8`. Поэтому адрес проверяется до первого байта.
 *
 * ВАЖНО: функция намеренно НЕ резолвит DNS — она чистая и синхронная.
 * Проверка имени хоста ничего не гарантирует: `evil.example` спокойно
 * указывает `A`-записью на `127.0.0.1`. Резолв и сверку полученного адреса
 * делает загрузчик, и делает их **на каждом редиректе**, а не один раз перед
 * запросом: `302` уводит внутрь контура ровно так же, как имя. Этот модуль
 * закрывает только литеральные адреса и чужие схемы — считать его достаточным
 * нельзя.
 */

export type IngestUrlRejection =
  | 'malformed'
  | 'scheme_not_allowed'
  | 'private_address';

/** Больше трёх пересылок — либо петля, либо площадка, которая нас не ждёт. */
export const INGEST_MAX_REDIRECTS = 3;

/** Схемы, по которым вообще бывает файл, который мы можем скачать. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Разбор одной части IPv4 в духе `inet_aton`: десятичная, восьмеричная с
 * ведущим нулём и шестнадцатеричная с `0x` записи — всё это резолверы и
 * `new URL` понимают одинаково. Смотреть только на десятичную запись значит
 * пропустить `http://0x7f.0.0.1` и `http://0177.0.0.1` — тот же `127.0.0.1`
 * другими буквами.
 */
function parseIPv4Part(part: string): number | null {
  if (part.length === 0) return null;
  let value: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
    value = Number.parseInt(part.slice(2), 16);
  } else if (/^0[0-7]+$/.test(part)) {
    value = Number.parseInt(part.slice(1), 8);
  } else if (/^[0-9]+$/.test(part)) {
    value = Number.parseInt(part, 10);
  } else {
    return null;
  }
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * IPv4 как одно 32-битное число или `null`, если это не адрес.
 *
 * Частей бывает от одной до четырёх: `2130706433` и `127.1` — законные записи
 * петли, последняя часть добирает оставшиеся байты.
 */
function parseIPv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    const value = parseIPv4Part(part);
    if (value === null) return null;
    numbers.push(value);
  }

  const last = numbers[numbers.length - 1];
  // Хвост добирает все байты, которые не назвали явно.
  const tailBytes = 4 - numbers.length;
  if (last > 2 ** (8 * (tailBytes + 1)) - 1) return null;
  for (let index = 0; index < numbers.length - 1; index += 1) {
    if (numbers[index] > 255) return null;
  }

  let result = last;
  for (let index = 0; index < numbers.length - 1; index += 1) {
    result += numbers[index] * 2 ** (8 * (3 - index));
  }
  return result >>> 0;
}

/** Диапазон IPv4, из которого файлов не бывает. */
interface IPv4Range {
  /** Начало диапазона. */
  base: number;
  /** Длина маски: 8 — это `/8`. */
  bits: number;
  /** Зачем закрыт. */
  why: string;
}

const toIPv4 = (a: number, b: number, c: number, d: number): number =>
  ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

/**
 * Первые шесть диапазонов — обязательная часть: это и есть внутренняя сеть
 * вокруг нашего контейнера. Остальные добавлены сверху: публичного сервера с
 * файлом там не бывает, а вот сосед по NAT провайдера или широковещание —
 * бывают.
 */
const PRIVATE_IPV4: readonly IPv4Range[] = [
  { base: toIPv4(0, 0, 0, 0), bits: 8, why: 'этот хост' },
  { base: toIPv4(10, 0, 0, 0), bits: 8, why: 'частная сеть' },
  { base: toIPv4(127, 0, 0, 0), bits: 8, why: 'петля' },
  { base: toIPv4(169, 254, 0, 0), bits: 16, why: 'link-local и метаданные облака' },
  // Именно /12: 172.16–172.31 частные, а 172.32.0.1 уже обычный публичный.
  { base: toIPv4(172, 16, 0, 0), bits: 12, why: 'частная сеть' },
  { base: toIPv4(192, 168, 0, 0), bits: 16, why: 'частная сеть' },
  { base: toIPv4(100, 64, 0, 0), bits: 10, why: 'NAT провайдера' },
  { base: toIPv4(192, 0, 0, 0), bits: 24, why: 'служебные назначения IETF' },
  { base: toIPv4(198, 18, 0, 0), bits: 15, why: 'сетевые замеры' },
  { base: toIPv4(224, 0, 0, 0), bits: 4, why: 'многоадресная рассылка' },
  { base: toIPv4(240, 0, 0, 0), bits: 4, why: 'зарезервировано, включая широковещание' },
];

function isPrivateIPv4(value: number): boolean {
  return PRIVATE_IPV4.some(({ base, bits }) => {
    // `/0` тут не бывает, поэтому сдвиг безопасен.
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === base;
  });
}

/**
 * IPv6 в восемь 16-битных групп или `null`. Понимает сжатие `::` и
 * десятичный хвост `::ffff:127.0.0.1`.
 */
function parseIPv6(raw: string): number[] | null {
  // Идентификатор зоны (`fe80::1%eth0`) на принадлежность к диапазону не
  // влияет, но разбор ломает.
  const host = raw.split('%')[0];
  if (host.length === 0 || !/^[0-9a-fA-F:.]+$/.test(host)) return null;

  const halves = host.split('::');
  if (halves.length > 2) return null;

  const expand = (chunk: string): number[] | null => {
    if (chunk.length === 0) return [];
    const groups: number[] = [];
    const pieces = chunk.split(':');
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (piece.includes('.')) {
        // Десятичный хвост законен только последним и занимает две группы.
        if (index !== pieces.length - 1) return null;
        const embedded = parseIPv4(piece);
        if (embedded === null) return null;
        groups.push((embedded >>> 16) & 0xffff, embedded & 0xffff);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  const head = expand(halves[0]);
  if (head === null) return null;

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = expand(halves[1]);
  if (tail === null) return null;
  const gap = 8 - head.length - tail.length;
  if (gap < 1) return null;
  return [...head, ...new Array<number>(gap).fill(0), ...tail];
}

/**
 * Префиксы, в которых внутри адреса спрятан обычный IPv4. Их надо
 * развернуть и проверить как IPv4: сравнение префикса пропустит
 * `::ffff:10.0.0.1`, а `new URL` вдобавок перепишет его в
 * `[::ffff:a00:1]` — в такой записи точек уже нет и текстовое сравнение
 * бесполезно.
 */
function embeddedIPv4(groups: number[]): number | null {
  const leadingZeros = (count: number): boolean =>
    groups.slice(0, count).every((group) => group === 0);

  // ::ffff:0:0/96 — IPv4-mapped.
  if (leadingZeros(5) && groups[5] === 0xffff) {
    return ((groups[6] << 16) | groups[7]) >>> 0;
  }
  // 64:ff9b::/96 — NAT64, тот же приём через шлюз трансляции.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return ((groups[6] << 16) | groups[7]) >>> 0;
  }
  // 2002::/16 — 6to4: адрес шлюза лежит в битах 16–47, и `2002:7f00:1::`
  // — это `127.0.0.1`, записанный третьим способом. Разворачиваем тем же
  // приёмом, что и NAT64: сравнение префикса пропустило бы его целиком.
  if (groups[0] === 0x2002) {
    return ((groups[1] << 16) | groups[2]) >>> 0;
  }
  // ::/96 — устаревший IPv4-compatible; `::1` и `::` разбираются отдельно.
  if (leadingZeros(6) && (groups[6] !== 0 || groups[7] > 1)) {
    return ((groups[6] << 16) | groups[7]) >>> 0;
  }
  return null;
}

function isPrivateIPv6(groups: number[]): boolean {
  const embedded = embeddedIPv4(groups);
  if (embedded !== null) return isPrivateIPv4(embedded);

  // :: и ::1 — неопределённый адрес и петля.
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;

  const first = groups[0];
  // fc00::/7 — уникальные локальные, на практике префиксы fc и fd.
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local.
  if ((first & 0xffc0) === 0xfe80) return true;
  // fec0::/10 — устаревшие site-local, но резолверы их ещё встречают.
  if ((first & 0xffc0) === 0xfec0) return true;
  // ff00::/8 — многоадресная рассылка.
  if ((first & 0xff00) === 0xff00) return true;

  return false;
}

/**
 * Литеральный адрес принадлежит внутренней сети. Не адрес — `false`: имена
 * этой функции не касаются, их разбирает `checkIngestUrl` и резолвер
 * загрузчика.
 */
export function isPrivateAddress(ip: string): boolean {
  if (typeof ip !== 'string') return false;
  const host = stripHost(ip);
  if (host.length === 0) return false;

  if (host.includes(':')) {
    const groups = parseIPv6(host);
    return groups === null ? false : isPrivateIPv6(groups);
  }

  const value = parseIPv4(host);
  return value === null ? false : isPrivateIPv4(value);
}

/**
 * Приведение хоста к сравнимому виду: скобки IPv6, регистр и завершающая
 * точка. Точка на конце — не украшение: `localhost.` резолвится в ту же
 * петлю, но со строкой `localhost` не совпадает.
 */
function stripHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  while (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  return host;
}

/**
 * Имена, которые по RFC 6761 всегда указывают на петлю. Резолвить их незачем,
 * а `*.localhost` работает так же, как сам `localhost`.
 */
function isLoopbackName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost');
}

/**
 * `null` — по адресу можно идти. Иначе причина отказа, пригодная для
 * сохранения в позиции партии.
 */
export function checkIngestUrl(raw: string): IngestUrlRejection | null {
  if (typeof raw !== 'string') return 'malformed';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'malformed';

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'malformed';
  }

  // Схема проверяется первой: у `file:` и `data:` хоста нет вовсе, и без
  // этого порядка отказ получился бы «malformed» вместо внятной причины.
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return 'scheme_not_allowed';

  // Именно `hostname`, а не исходная строка: `http://example.org@127.0.0.1/`
  // выглядит как поход на example.org, а идёт в петлю.
  const host = stripHost(url.hostname);
  if (host.length === 0) return 'malformed';

  if (isLoopbackName(host)) return 'private_address';
  if (isPrivateAddress(host)) return 'private_address';

  return null;
}
