import type { MusicTranscodeMime } from '@vedamatch/shared';
import { readId3v2Size } from './music-duration-estimate';

/**
 * Перекодирование FLAC, WAV и OGG в m4a (VED-244): что это за файл, какой
 * битрейт выбрать и с какими аргументами звать ffprobe и ffmpeg.
 *
 * Чистым модулем с тестами, а обёртка со `spawn` и временными файлами
 * (`music-transcode.service.ts`) — без них: ошибка в строке аргументов не
 * падает, а тихо даёт не тот результат (моно вместо стерео, 128 kbps вместо
 * 256, файл без `faststart`, который Safari не начнёт играть до конца
 * скачивания). Тот же приём, что у `blog-video.ts`; копия, а не импорт, —
 * по контракту сервисного модуля.
 */

/** Куда перекодируем: AAC в MP4-контейнере играет везде, включая старые iOS. */
export const TRANSCODE_OUTPUT_MIME = 'audio/mp4';
export const TRANSCODE_OUTPUT_EXTENSION = 'm4a';

/**
 * Ступени битрейта AAC, от лучшей. 256 kbps AAC на слух не отличим от
 * исходника без потерь; ниже спускаемся, только когда запись длинная и в
 * 256 не помещается в предел объёма одного файла. 96 — нижняя граница, на
 * которой лекция ещё звучит прилично; длиннее — отказ, а не каша.
 */
export const TRANSCODE_BITRATE_LADDER_KBPS = [256, 192, 160, 128, 96] as const;

/**
 * Запас на контейнер: заголовок MP4 и таблицы сэмплов добавляют к потоку
 * AAC около процента. Два — чтобы результат не упёрся в предел впритык.
 */
const CONTAINER_OVERHEAD = 1.02;

/** Сколько попыток перекодирования, прежде чем отказать насовсем. */
export const TRANSCODE_MAX_ATTEMPTS = 3;

/**
 * Потолок одного запуска ffmpeg. Четыре часа WAV перекодируются в AAC на
 * одном ядре минуты за три-пять; полчаса — с большим запасом на медленный
 * сервер, но зависший процесс не держит стадию вечно.
 */
export const TRANSCODE_FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Через сколько строка в `transcoding` считается брошенной упавшим
 * процессом. Больше, чем занимает худший честный заход: скачать гигабайт,
 * полчаса ffmpeg, залить результат.
 */
export const TRANSCODE_STALE_MS = 90 * 60 * 1000;

export type TranscodeContainer = 'flac' | 'wav' | 'ogg';

const MIME_BY_CONTAINER: Record<TranscodeContainer, MusicTranscodeMime> = {
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export interface SniffedAudio {
  container: TranscodeContainer;
  mime: MusicTranscodeMime;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return '';
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Что лежит в файле — по первым байтам, а не по заявленному типу и имени.
 *
 * - FLAC: `fLaC`; перед ним бывает ID3v2-тег (так пишут некоторые
 *   тегировщики), его пропускаем.
 * - WAV: `RIFF` (или `RF64` для файлов больше 4 ГБ) и `WAVE` на восьмом байте.
 * - OGG: `OggS`, и первый пакет — заголовок Vorbis, Opus или FLAC. Ogg
 *   бывает и видео (Theora) — такой не берём.
 *
 * `null` — ни один из трёх. mp3 и m4a сюда тоже попадают как `null`: их
 * путь — прежний, без перекодирования.
 */
export function sniffTranscodeSource(
  prefix: Uint8Array | null,
): SniffedAudio | null {
  if (!prefix || prefix.length < 12) return null;
  const found = (container: TranscodeContainer): SniffedAudio => ({
    container,
    mime: MIME_BY_CONTAINER[container],
  });

  const tagSize = readId3v2Size(prefix);
  if (ascii(prefix, tagSize, 4) === 'fLaC') return found('flac');

  const riff = ascii(prefix, 0, 4);
  if ((riff === 'RIFF' || riff === 'RF64') && ascii(prefix, 8, 4) === 'WAVE') {
    return found('wav');
  }

  if (ascii(prefix, 0, 4) === 'OggS' && prefix.length >= 27) {
    // Заголовок страницы Ogg — 27 байт, дальше таблица сегментов длиной
    // `prefix[26]`, и только за ней первый пакет потока.
    const packet = 27 + prefix[26];
    if (ascii(prefix, packet, 7) === '\x01vorbis') return found('ogg');
    if (ascii(prefix, packet, 8) === 'OpusHead') return found('ogg');
    if (ascii(prefix, packet, 5) === '\x7fFLAC') return found('ogg');
    return null;
  }

  return null;
}

/**
 * Путь к ffmpeg и ffprobe. В образе API оба ставятся пакетом `ffmpeg` из
 * apk и лежат на PATH; на машине разработчика — где угодно.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function ffprobePath(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

/**
 * ffprobe: длительность контейнера и параметры первой аудиодорожки — JSON,
 * а не текст: его разбор не зависит от версии и локали ffprobe.
 */
export function buildFfprobeArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_type,sample_rate,channels',
    '-of',
    'json',
    inputPath,
  ];
}

export interface ProbedAudio {
  /** Целые секунды, не меньше одной; `null` — не прочиталась. */
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  /** Есть ли в файле аудиодорожка вообще. */
  hasAudio: boolean;
}

function positive(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0
    ? number
    : null;
}

/**
 * Разбор ответа `buildFfprobeArgs`. Мусор на входе — не исключение, а
 * пустой результат: отказать за файл без дорожки и длительности должен
 * вызывающий, с человеческой причиной.
 */
export function parseFfprobeOutput(stdout: string): ProbedAudio {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  const root = (parsed ?? {}) as {
    format?: { duration?: unknown };
    streams?: {
      codec_type?: unknown;
      sample_rate?: unknown;
      channels?: unknown;
    }[];
  };
  const audio = Array.isArray(root.streams)
    ? root.streams.find((stream) => stream?.codec_type === 'audio')
    : undefined;
  const seconds = positive(root.format?.duration);

  return {
    durationSeconds: seconds === null ? null : Math.max(1, Math.round(seconds)),
    sampleRate: audio ? positive(audio.sample_rate) : null,
    channels: audio ? positive(audio.channels) : null,
    hasAudio: Boolean(audio),
  };
}

/**
 * Битрейт результата: лучшая ступень, при которой файл укладывается в
 * `maxBytes`. `null` — не помещается даже на нижней ступени: запись слишком
 * длинная для одного файла, и честнее отказать, чем пережать её в кашу.
 */
export function chooseTranscodeBitrateKbps(
  durationSeconds: number,
  maxBytes: number,
  ladder: readonly number[] = TRANSCODE_BITRATE_LADDER_KBPS,
): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  for (const kbps of ladder) {
    const bytes = ((kbps * 1000) / 8) * durationSeconds * CONTAINER_OVERHEAD;
    if (bytes <= maxBytes) return kbps;
  }
  return null;
}

/**
 * Частота дискретизации на выходе. Выше 48 кГц (студийные 88.2/96/192) —
 * вниз до 48: встроенный AAC-кодировщик ffmpeg выше 96 кГц не умеет, а
 * мобильные декодеры спотыкаются уже на 88.2. `null` — оставить как есть.
 */
export function outputSampleRate(sampleRate: number | null): number | null {
  return sampleRate !== null && sampleRate > 48_000 ? 48_000 : null;
}

export interface TranscodeArgsInput {
  inputPath: string;
  outputPath: string;
  bitrateKbps: number;
  sampleRate: number | null;
  channels: number | null;
}

/**
 * ffmpeg: исходник → AAC в m4a.
 *
 * - `-map 0:a:0` — только первая аудиодорожка: картинка обложки из FLAC
 *   (в ffmpeg это видеопоток) в m4a не нужна, обложку сервис достаёт из
 *   тегов исходника сам и кладёт отдельным объектом.
 * - `-map_metadata 0` — название и исполнитель переезжают в результат.
 * - `-ac 2` только для многоканального: моно остаётся моно и не удваивает
 *   объём, 5.1 сводится в стерео, которое играют телефоны.
 * - `-movflags +faststart` — индекс в начале файла: без него Safari и
 *   плеер Android не начнут играть, пока не скачают запись целиком.
 * - `-nostdin` — иначе ffmpeg без терминала ждёт ввода и висит до таймаута.
 */
export function buildTranscodeArgs(input: TranscodeArgsInput): string[] {
  const rate = outputSampleRate(input.sampleRate);
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    input.inputPath,
    '-map',
    '0:a:0',
    '-map_metadata',
    '0',
    '-c:a',
    'aac',
    '-b:a',
    `${input.bitrateKbps}k`,
    ...(rate !== null ? ['-ar', String(rate)] : []),
    ...(input.channels !== null && input.channels > 2 ? ['-ac', '2'] : []),
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    input.outputPath,
  ];
}

/**
 * Что делать со строкой после неудачной попытки: вернуть в очередь или
 * отказать насовсем. `attempts` — уже с учётом только что провалившейся
 * (счётчик растёт при клейме).
 */
export function transcodeStatusAfterFailure(
  attempts: number,
  maxAttempts: number = TRANSCODE_MAX_ATTEMPTS,
): 'transcode_queued' | 'failed' {
  return attempts >= maxAttempts ? 'failed' : 'transcode_queued';
}

/** Что форма загрузки передала на `complete` — дожидается конца стадии. */
export interface TranscodeRequest {
  fileName: string | null;
  lineage: string | null;
  artistId: string | null;
  audiobookId: string | null;
  canAssignArtist: boolean;
}

/**
 * Разбор сохранённой заявки из JSON-колонки. Руками её никто не пишет, но
 * колонка — `Json`, и верить её форме на слово значит уронить стадию на
 * первой же строке, заведённой прошлой версией кода.
 */
export function parseTranscodeRequest(value: unknown): TranscodeRequest {
  const row = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string): string | null => {
    const value = row[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  return {
    fileName: text('fileName'),
    lineage: text('lineage'),
    artistId: text('artistId'),
    audiobookId: text('audiobookId'),
    canAssignArtist: row.canAssignArtist === true,
  };
}
