/**
 * Разбор ролика поста (VED-116): кадр-обложка, длительность и размер кадра.
 *
 * Аргументы ffmpeg и разбор его вывода — отдельным модулем с тестами, а
 * обёртка со `spawn` (`blog-video.service.ts`) — без них: ошибка в строке
 * аргументов не падает, а тихо даёт не тот результат. Тот же приём, что у
 * `story-image.ts` во «Вдохновении»; копия, а не импорт, — по контракту.
 *
 * ffprobe не зовём: вся информация о входе и так печатается ffmpeg-ом, пока
 * он снимает кадр, — один процесс вместо двух и на одну зависимость образа
 * меньше.
 */

/**
 * Путь к ffmpeg. В образе API он ставится через apk и лежит на PATH; на
 * машине разработчика может быть где угодно, поэтому есть переопределение.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

/**
 * Кадр-обложка в PNG. Не нулевая секунда, а десятая доля: первый кадр съёмки
 * с телефона часто чёрный — камера ещё выставляет экспозицию.
 *
 * PNG, а не webp: набор кодировщиков зависит от сборки ffmpeg, а PNG умеет
 * любая; в webp обложку пережимает `sharp`, как и все картинки блога.
 *
 * `-loglevel info` обязателен: именно на этом уровне ffmpeg печатает
 * `Duration:` и строку видеопотока, которые разбирает `parseFfmpegInfo`.
 */
export function buildBlogPosterArgs(input: {
  videoPath: string;
  posterPath: string;
}): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'info',
    '-nostdin',
    // `-ss` до `-i` — перемотка по ключевым кадрам без декодирования начала.
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

export interface BlogVideoInfo {
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Длительность и размер кадра из того, что ffmpeg пишет в stderr о входе:
 *
 *   Duration: 00:01:02.50, start: 0.000000, bitrate: 1200 kb/s
 *   Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720 [SAR 1:1 DAR 16:9], ...
 *
 * Неполный вывод — не ошибка разбора: отказать за ролик без видеодорожки
 * должен вызывающий. Размер берётся у первого видеопотока входа: у выхода
 * (обложки) тоже есть строка `Video:`, и она идёт позже.
 *
 * Поворот с телефона (`rotate: 90` / `displaymatrix`) меняет местами ширину и
 * высоту — иначе вертикальный ролик ляжет в ленте горизонтальной рамкой.
 */
export function parseFfmpegInfo(stderr: string): BlogVideoInfo {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  let durationSec: number | null = null;
  if (duration) {
    const seconds =
      Number(duration[1]) * 3600 +
      Number(duration[2]) * 60 +
      Number(duration[3]);
    durationSec =
      Number.isFinite(seconds) && seconds > 0
        ? Math.max(1, Math.round(seconds))
        : null;
  }

  const input = stderr.split(/^Output #\d+/m)[0] ?? stderr;
  const stream =
    /Stream #\d+:\d+[^\n]*?Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(input);
  let width = stream ? Number(stream[1]) : null;
  let height = stream ? Number(stream[2]) : null;

  const rotation =
    /rotate\s*:\s*(-?\d+)/.exec(input) ??
    /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(input);
  if (rotation && width !== null && height !== null) {
    const turn = Math.abs(Math.round(Number(rotation[1]))) % 180;
    if (turn === 90) [width, height] = [height, width];
  }

  return { durationSec, width, height };
}
