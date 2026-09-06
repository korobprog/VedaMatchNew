import { CHAT_MOMENT_VIDEO_MAX_SECONDS } from '@vedamatch/shared';

/**
 * Разбор роликов момента: постер и длительность.
 *
 * Аргументы внешних утилит собираются отдельным модулем и покрываются
 * тестами, а обёртка со `spawn` — нет: ошибка в строке аргументов не падает,
 * а тихо даёт не тот результат. Тот же приём, что у `story-image.ts` во
 * «Вдохновении»; дублирование внутри модуля осознанное — контракт запрещает
 * импортировать чужой сервис.
 */

/**
 * Путь к ffmpeg. В образе он ставится через apk и лежит на PATH; на машине
 * разработчика может быть где угодно, поэтому есть переопределение.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function ffprobePath(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

/**
 * Первый кадр в файл.
 *
 * Берём не нулевую секунду, а десятую долю: первый кадр съёмки с телефона
 * часто чёрный — камера ещё не выставила экспозицию, — и постером он
 * выглядит как сломанный ролик.
 *
 * Кадр выходит в PNG, а в webp его пережимает `sharp`. Не из любви к лишнему
 * шагу: набор кодировщиков ffmpeg зависит от сборки, и webp в ней может не
 * оказаться — на такой сборке загрузка ролика отвечала «не удалось прочитать»
 * при полностью исправном файле. PNG умеет любая сборка, а `sharp` в портале
 * и так пережимает все картинки.
 */
export function buildPosterArgs(input: {
  videoPath: string;
  posterPath: string;
}): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    // `-ss` до `-i` — перемотка по ключевым кадрам, без декодирования всего
    // начала: на тридцати секундах разница невелика, но и платить за неё
    // незачем.
    '-ss',
    '0.1',
    '-i',
    input.videoPath,
    '-frames:v',
    '1',
    '-f',
    'image2',
    '-c:v',
    'png',
    '-y',
    input.posterPath,
  ];
}

/** Длительность и размер кадра одной строкой, машинно разбираемой. */
export function buildProbeArgs(videoPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration:stream=width,height',
    '-of',
    'default=noprint_wrappers=1:nokey=0',
    videoPath,
  ];
}

export interface ProbeResult {
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Разбор вывода ffprobe. Неполный ответ — не ошибка: у ролика без видеодорожки
 * не будет размеров, и отказать за это должен вызывающий, а не разбор.
 */
export function parseProbe(stdout: string): ProbeResult {
  const values = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }

  return {
    durationSec: round(values.get('duration')),
    width: round(values.get('width')),
    height: round(values.get('height')),
  };
}

/** `null` — длительность подходит; строка — объяснение отказа человеку. */
export function denyDuration(durationSec: number | null): string | null {
  if (durationSec === null)
    return 'Не удалось прочитать ролик — попробуйте другой файл';
  if (durationSec <= 0) return 'В ролике нет видео';
  if (durationSec > CHAT_MOMENT_VIDEO_MAX_SECONDS)
    return `Ролик длиннее ${CHAT_MOMENT_VIDEO_MAX_SECONDS} секунд`;
  return null;
}

function round(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}
