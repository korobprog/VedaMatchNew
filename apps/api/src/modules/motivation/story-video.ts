import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  renderStoryOverlay,
  type StoryOverlayInput,
} from './story-image';

/**
 * Путь к ffmpeg. В образе он ставится через apk и лежит на PATH; на машине
 * разработчика может быть где угодно, поэтому есть override переменной.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

/** То же, что и на кадре, но в метаданных файла. */
export const VIDEO_DISCLOSURE =
  'Создано нейросетью в VedaMatch. AI-generated video created with VedaMatch.';

export type StoryVideoArgs = {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
  /** До какой длины растянуть ролик повтором. Пусто — оставить как есть. */
  loopToSeconds?: number;
  /** Звуковая дорожка. Обрезается по длине ролика, с фейдами по краям. */
  audioPath?: string;
  /**
   * Громкость дорожки. Музыка играет фоном и должна быть тише, голос —
   * наоборот, он и есть содержание.
   */
  audioVolume?: number;
};

/**
 * Сколько секунд нужно, чтобы прочитать подпись.
 *
 * Ролик у модели длится пять секунд — за них четыре строки цитаты не прочитать.
 * Растягивать генерацию нельзя: у провайдера цена линейна по длине, пятнадцать
 * секунд стоят втрое. Поэтому длину задаём повтором, а нужную считаем от текста:
 * примерно двенадцать знаков в секунду — неспешное чтение с экрана телефона.
 */
export function estimateReadingSeconds(
  text: string,
  attribution?: string | null,
): number {
  const chars = text.trim().length + (attribution?.trim().length ?? 0);
  const seconds = chars / 12 + 2;
  // Ниже пяти нет смысла — столько длится сам ролик; выше тридцати сторис уже
  // никто не досматривает.
  return Math.min(30, Math.max(5, Math.round(seconds)));
}

/**
 * Аргументы для «бумеранга»: ролик вперёд, затем задом наперёд.
 *
 * Простой повтор дал бы рывок на стыке — последний кадр не совпадает с первым.
 * Развернув время, получаем бесшовный цикл, а на мягком движении, которое мы и
 * заказываем у модели (ветер, дрейф облаков), сам разворот незаметен.
 */
export function buildBoomerangArgs(input: {
  videoPath: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i',
    input.videoPath,
    '-filter_complex',
    '[0:v]split[fwd][back];[back]reverse[rev];[fwd][rev]concat=n=2:v=1[v]',
    '-map',
    '[v]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    input.outputPath,
  ];
}

/**
 * Аргументы ffmpeg для кадра сторис поверх ролика.
 *
 * Вынесено чистой функцией по той же причине, что и `buildStoryOverlaySvg`:
 * запускать кодек в тестах незачем, а порядок фильтров и флагов ломается
 * молча — видео просто уезжает по краям или не играет в браузере.
 */
export function buildStoryVideoArgs(input: StoryVideoArgs): string[] {
  const loop = input.loopToSeconds;
  return [
    '-y',
    // Повтор задаётся до входа, а не фильтром: так ffmpeg крутит уже
    // декодированный файл, не перечитывая его с диска на каждом круге.
    ...(loop ? ['-stream_loop', '-1'] : []),
    '-i',
    input.videoPath,
    '-i',
    input.overlayPath,
    ...(input.audioPath ? ['-i', input.audioPath] : []),
    // Ролик приходит от модели меньшего размера (замер: 704×1248), поэтому
    // сначала докадрируем до 1080×1920 — иначе подпись, свёрстанная под этот
    // кадр, не совпадёт с картинкой.
    '-filter_complex',
    `[0:v]scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${STORY_WIDTH}:${STORY_HEIGHT}[bg];[bg][1:v]overlay=0:0[v]` +
      (input.audioPath
        ? // Фейды по краям: без них подложка обрывается на полуноте.
          `;[2:a]afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, (loop ?? 5) - 1.5)}:d=1.5,volume=${input.audioVolume ?? 0.35}[a]`
        : ''),
    '-map',
    '[v]',
    // Со своей дорожкой берём её, иначе переносим звук ролика. `?` не даёт
    // ffmpeg упасть на немом файле.
    ...(input.audioPath ? ['-map', '[a]'] : ['-map', '0:a?']),
    // Обрезаем ровно по заданной длине: и повтор, и музыка длиннее её.
    ...(loop ? ['-t', String(loop)] : []),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    // Без yuv420p ролик не играет в Safari и в предпросмотре Telegram.
    '-pix_fmt',
    'yuv420p',
    // Свою дорожку пропускаем через фильтр (фейды, громкость), а
    // отфильтрованный поток скопировать нельзя — ffmpeg отказывается
    // совмещать filtergraph и streamcopy. Родной звук ролика копируем как был.
    '-c:a',
    ...(input.audioPath ? ['aac', '-b:a', '160k'] : ['copy']),
    // Индекс в начало файла: иначе браузер ждёт полной загрузки перед стартом.
    '-movflags',
    '+faststart',
    // Метка в самом файле, а не только на пикселях: надпись переживёт
    // перекодирование площадкой, а метаданные читаются автоматикой, которая
    // как раз и решает, помечать ли ролик значком «сделано ИИ».
    '-metadata',
    `comment=${VIDEO_DISCLOSURE}`,
    '-metadata',
    'copyright=VedaMatch',
    input.outputPath,
  ];
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Держим только хвост: ffmpeg пишет много строк прогресса, а нужен финал.
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

/**
 * Накладывает цитату и подпись на готовый ролик.
 *
 * Оверлей — тот же SVG, что и у неподвижной сторис: одна вёрстка на картинку
 * и на видео, иначе они разъедутся при первой же правке отступов.
 */
export async function composeStoryVideo(
  video: Buffer,
  overlay: StoryOverlayInput,
  options?: {
    loopToSeconds?: number;
    /** Готовая дорожка в памяти: воркер получает её от провайдера, не файлом. */
    audio?: Buffer;
    audioVolume?: number;
  },
): Promise<Buffer> {
  const overlayPng = await renderStoryOverlay(overlay);

  const dir = await mkdtemp(join(tmpdir(), 'vm-story-'));
  try {
    const videoPath = join(dir, 'in.mp4');
    const overlayPath = join(dir, 'overlay.png');
    const outputPath = join(dir, 'out.mp4');
    await writeFile(videoPath, video);
    await writeFile(overlayPath, overlayPng);

    // Бумеранг собирается отдельным проходом: разворот времени требует всего
    // ролика целиком, одним фильтром с зацикливанием это не выразить.
    let audioPath: string | undefined;
    if (options?.audio) {
      audioPath = join(dir, 'audio.mp3');
      await writeFile(audioPath, options.audio);
    }

    let source = videoPath;
    if (options?.loopToSeconds) {
      source = join(dir, 'boomerang.mp4');
      await runFfmpeg(
        buildBoomerangArgs({ videoPath, outputPath: source }),
      );
    }

    await runFfmpeg(
      buildStoryVideoArgs({
        videoPath: source,
        overlayPath,
        outputPath,
        loopToSeconds: options?.loopToSeconds,
        audioPath,
        audioVolume: options?.audioVolume,
      }),
    );
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
