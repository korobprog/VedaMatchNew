/**
 * Проверка загружаемого короткого видео (VED-246).
 *
 * Отдельным модулем, как проверка кадра и фоновой записи: правила чистые, а
 * ошибаться в них дорого — файл едет в хранилище и раздаётся всем читателям.
 *
 * Перекодирования нет: ролик хранится как пришёл. Поэтому тип определяем по
 * содержимому, а не по `mimetype` из формы — браузеры присылают для `.mov`
 * то `video/quicktime`, то пустую строку, а подпись типа ничего не говорит о
 * том, что внутри.
 */

/** Потолок размера. Короткий ролик в 1080p укладывается с запасом. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Потолок длительности: лента коротких роликов, а не лекций. */
export const MAX_VIDEO_SECONDS = 90;

export interface UploadedVideo {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export type VideoContainer = 'mp4' | 'mov' | 'webm';

export type VideoProblem =
  | 'video_missing'
  | 'video_type'
  | 'video_too_big'
  | 'video_duration_unknown'
  | 'video_too_long';

/**
 * Что внутри файла — по сигнатуре. mp4 и mov — одна семья (ISO BMFF): первым
 * идёт бокс `ftyp`, а мажорный бренд `qt  ` отличает QuickTime. У старых
 * `.mov` бокса `ftyp` нет — они начинаются сразу с `moov`/`mdat`/`wide`.
 * WebM — контейнер Matroska с EBML-заголовком `1A 45 DF A3`.
 */
export function sniffVideoContainer(buffer: Buffer): VideoContainer | null {
  if (buffer.length < 12) return null;
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  )
    return 'webm';
  const box = buffer.toString('latin1', 4, 8);
  if (box === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }
  if (box === 'moov' || box === 'mdat' || box === 'wide') return 'mov';
  return null;
}

/**
 * С каким типом отдавать файл. mov — тоже `video/mp4`: браузеры определяют
 * формат ролика по содержимому, а `video/quicktime` Chrome и Firefox считают
 * «не умею» ещё до загрузки. H.264 в mov они играют как обычный mp4.
 */
export function videoContentType(container: VideoContainer): string {
  return container === 'webm' ? 'video/webm' : 'video/mp4';
}

/**
 * Ключ в хранилище. Расширение — по содержимому, а не по имени файла; со
 * временем создания — как у фоновых записей: повторная загрузка не затирает
 * первую.
 */
export function videoKey(
  id: string,
  container: VideoContainer,
  now: number,
): string {
  return `motivation/videos/${id}-${now}.${container}`;
}

/**
 * Длительность mp4/mov из заголовка `mvhd` (в `moov`), в секундах.
 *
 * Без ffprobe: его нет в образе, а ради одного числа поднимать процесс на
 * каждый файл не стоит. `moov` может лежать и в конце файла (без faststart) —
 * буфер у нас целый, поэтому ищем по всему верхнему уровню. `null` — заголовок
 * не нашёлся или битый.
 */
export function mp4DurationSeconds(buffer: Buffer): number | null {
  const moov = findBox(buffer, 0, buffer.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buffer, moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;
  const at = mvhd.start;
  if (at + 4 > mvhd.end) return null;
  const version = buffer[at];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    // version+flags 4, creation 8, modification 8, timescale 4, duration 8.
    if (at + 32 > mvhd.end) return null;
    timescale = buffer.readUInt32BE(at + 20);
    duration = Number(buffer.readBigUInt64BE(at + 24));
  } else {
    // version+flags 4, creation 4, modification 4, timescale 4, duration 4.
    if (at + 20 > mvhd.end) return null;
    timescale = buffer.readUInt32BE(at + 12);
    duration = buffer.readUInt32BE(at + 16);
  }
  if (!timescale || !Number.isFinite(duration)) return null;
  // Все единицы — «длительность неизвестна» (так пишут потоковые файлы).
  if (duration === 0xffffffff) return null;
  return duration / timescale;
}

/** Содержимое бокса нужного типа в диапазоне `[from, to)`: без заголовка. */
function findBox(
  buffer: Buffer,
  from: number,
  to: number,
  type: string,
): { start: number; end: number } | null {
  let offset = from;
  while (offset + 8 <= to) {
    let size = buffer.readUInt32BE(offset);
    const name = buffer.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > to) return null;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header || offset + size > to) return null;
    if (name === type) return { start: offset + header, end: offset + size };
    offset += size;
  }
  return null;
}

/**
 * Итоговая длительность. Из файла — если прочиталась: ей верим больше, чем
 * форме. Иначе (WebM) — что прислал браузер, он прочитал её сам из
 * метаданных ролика перед загрузкой. Ноль и мусор — «неизвестно».
 */
export function resolveVideoDuration(
  parsed: number | null,
  claimed: unknown,
): number | null {
  if (parsed !== null && parsed > 0) return parsed;
  const value =
    typeof claimed === 'number'
      ? claimed
      : typeof claimed === 'string' && claimed.trim()
        ? Number(claimed)
        : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type VideoCheck =
  | { ok: true; container: VideoContainer; durationSeconds: number }
  | { ok: false; problem: VideoProblem };

/** Весь разбор файла разом: тип, размер, длительность. */
export function checkVideo(
  file: UploadedVideo | undefined,
  claimedDuration: unknown,
): VideoCheck {
  if (!file || !file.buffer?.length)
    return { ok: false, problem: 'video_missing' };
  if (file.size > MAX_VIDEO_BYTES)
    return { ok: false, problem: 'video_too_big' };
  const container = sniffVideoContainer(file.buffer);
  if (!container) return { ok: false, problem: 'video_type' };
  const parsed = container === 'webm' ? null : mp4DurationSeconds(file.buffer);
  const duration = resolveVideoDuration(parsed, claimedDuration);
  if (duration === null)
    return { ok: false, problem: 'video_duration_unknown' };
  // Полсекунды допуска: браузер и заголовок округляют по-разному.
  if (duration > MAX_VIDEO_SECONDS + 0.5)
    return { ok: false, problem: 'video_too_long' };
  return {
    ok: true,
    container,
    durationSeconds: Math.max(1, Math.round(duration)),
  };
}

/** Человеческое объяснение вместо кода: его читает редакция. */
export function videoMessage(problem: VideoProblem): string {
  switch (problem) {
    case 'video_missing':
      return 'Файл не выбран';
    case 'video_type':
      return 'Нужен видеофайл: mp4, webm или mov';
    case 'video_too_big':
      return 'Файл больше 50 МБ — сожмите ролик или возьмите короче';
    case 'video_duration_unknown':
      return 'Не удалось узнать длительность ролика — пересохраните его в mp4';
    case 'video_too_long':
      return `Ролик длиннее ${MAX_VIDEO_SECONDS} секунд — лента для коротких видео`;
  }
}

export type VideoInput = { category: string; title: string };

/**
 * Поля формы. Категория пустой — это «по умолчанию» (решает справочник),
 * название необязательно; длинное обрезаем, а не отбиваем: это подпись, а не
 * содержание.
 */
export function normalizeVideoInput(body: unknown): VideoInput {
  const record =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return {
    category: text(record.category),
    title: text(record.title).slice(0, 160),
  };
}
