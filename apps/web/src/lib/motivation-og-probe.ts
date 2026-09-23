/**
 * Размер исходной картинки превью — по заголовку файла, без скачивания
 * целиком (VED-357).
 *
 * Зачем. `og:image:width`/`og:image:height` собирает `generateMetadata()`,
 * а картинка превью повторяет пропорции исходника (`ogPreviewSize()` в
 * `motivation-og-image.ts`), и у каждого поста они свои. Размеров в базе нет,
 * а скачивать ради них трёхмегабайтный PNG на каждый заход страницы — дорого.
 * Ширина и высота лежат в первых байтах файла: у PNG, WebP и GIF — в первых
 * трёх десятках, у JPEG — в заголовке кадра после служебных блоков. Поэтому
 * страница просит у хранилища только начало файла (`Range`) и читает его сама.
 *
 * Не узнали размер — метатеги выходят без `width`/`height`. Это честнее, чем
 * угадать: бот разложил бы карточку по вымышленным пропорциям.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** Сколько байт начала файла просить. JPEG с крупным EXIF в это укладывается. */
export const PROBE_HEAD_BYTES = 64 * 1024;

/** Сколько ждать хранилище. Страница без размеров лучше, чем медленная. */
export const PROBE_TIMEOUT_MS = 3_000;

const PROBE_CACHE_LIMIT = 500;

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) =>
  b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) =>
  String.fromCharCode(...b.subarray(i, i + n));

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return sized(u32be(b, 16), u32be(b, 20));
}

function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10) return null;
  return sized(u16le(b, 6), u16le(b, 8));
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Ключевой кадр VP8: стартовый код 9d 01 2a, за ним 14-битные размеры.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    const height =
      1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
    return sized(width, height);
  }
  if (chunk === "VP8X") {
    // Флаг EXIF: поворот записан в блоке в конце файла, до него не дотянуться.
    // sharp повернёт кадр, а мы бы объявили размер боком — лучше промолчать.
    if (b[20] & 0x08) return null;
    return sized(u24le(b, 24) + 1, u24le(b, 27) + 1);
  }
  return null;
}

/** Ориентация из EXIF-блока JPEG (APP1). 1 — «как есть», если не нашли. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  if (end - start < 14 || ascii(b, start, 6) !== "Exif\0\0") return 1;
  const tiff = start + 6;
  const order = ascii(b, tiff, 2);
  if (order !== "II" && order !== "MM") return 1;
  const le = order === "II";
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) =>
    le
      ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
      : u32be(b, i);
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return 1;
    if (r16(entry) === 0x0112) return r16(entry + 8);
  }
  return 1;
}

function jpegSize(b: Uint8Array): ImageSize | null {
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Заполнитель и маркеры без длины.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      // Ориентации 5–8 — поворот на четверть оборота: ширина с высотой меняются.
      return orientation >= 5 && orientation <= 8
        ? sized(height, width)
        : sized(width, height);
    }
    if (marker === 0xe1) {
      orientation = exifOrientation(b, i + 4, Math.min(b.length, i + 2 + length));
    }
    i += 2 + length;
  }
  return null;
}

/**
 * Размер картинки по началу файла — уже с учётом поворота из EXIF, то есть
 * такой, каким его увидит `sharp(...).rotate()` в маршруте превью.
 * Незнакомый формат или обрывок заголовка — `null`.
 */
export function imageSizeFromHeader(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return pngSize(b);
  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b);
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    return webpSize(b);
  }
  if (ascii(b, 0, 4) === "GIF8") return gifSize(b);
  return null;
}

/** Начало тела ответа, не больше `limit` байт. Остальное не качаем. */
async function readHead(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer()).subarray(0, limit);
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      total += value.byteLength;
    }
  } finally {
    // Хранилище без поддержки Range отдаёт файл целиком — обрываем.
    reader.cancel().catch(() => {});
  }
  const head = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const part of parts) {
    if (offset >= head.length) break;
    const piece = part.subarray(0, head.length - offset);
    head.set(piece, offset);
    offset += piece.byteLength;
  }
  return head;
}

/**
 * Кэш по адресу файла. Адрес иллюстрации версионный (`…/v<время>.png`), и
 * по одному адресу всегда лежит один и тот же файл, так что размер можно
 * помнить, пока жив процесс. Неудачи не запоминаем — хранилище могло моргнуть.
 */
const probeCache = new Map<string, ImageSize>();

/** Для тестов. */
export function clearProbeCache(): void {
  probeCache.clear();
}

/**
 * Размер картинки по адресу: запрос начала файла и разбор заголовка.
 * Любая неудача — `null`, исключений наружу нет: из-за превью не должна
 * падать сама страница.
 */
export async function probeImageSize(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageSize | null> {
  const cached = probeCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetchImpl(url, {
      headers: { Range: `bytes=0-${PROBE_HEAD_BYTES - 1}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // Обрывок файла в кэш данных Next класть нельзя: его примут за файл.
      cache: "no-store",
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const size = imageSizeFromHeader(await readHead(response, PROBE_HEAD_BYTES));
    if (size) {
      if (probeCache.size >= PROBE_CACHE_LIMIT) {
        const oldest = probeCache.keys().next().value;
        if (oldest !== undefined) probeCache.delete(oldest);
      }
      probeCache.set(url, size);
    }
    return size;
  } catch {
    return null;
  }
}
