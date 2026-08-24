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
  /** Озвучка цитаты. Идёт на полной громкости — она и есть содержание. */
  voicePath?: string;
  /** Музыкальная подложка. Играет тише голоса и с фейдами по краям. */
  musicPath?: string;
  /** Громкость подложки. По умолчанию заметно тише речи. */
  musicVolume?: number;
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
/**
 * Звуковая часть фильтра.
 *
 * Голос и музыка сводятся через `amix` с `normalize=0`: по умолчанию фильтр
 * делит громкость между источниками, и речь проваливалась бы ровно настолько,
 * насколько громче музыка. Нам нужно обратное — музыка отступает под голос.
 */
function buildAudioFilter(input: StoryVideoArgs, loop?: number): string {
  const seconds = loop ?? 5;
  // Индексы входов: 0 — ролик, 1 — подпись, дальше по порядку добавления.
  const voiceIndex = 2;
  const musicIndex = input.voicePath ? 3 : 2;
  const fadeOut = Math.max(0, seconds - 1.5);
  const music =
    `[${musicIndex}:a]volume=${input.musicVolume ?? 0.18},` +
    // Фейды по краям: без них подложка обрывается на полуноте.
    `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=1.5[m]`;

  if (input.voicePath && input.musicPath)
    return `;[${voiceIndex}:a]volume=1[v];${music};[v][m]amix=inputs=2:duration=first:normalize=0[a]`;
  if (input.voicePath) return `;[${voiceIndex}:a]volume=1[a]`;
  if (input.musicPath) return `;${music.replace('[m]', '[a]')}`;
  return '';
}

/**
 * Сколько ролик играет без подписи: сперва смотрят сам кадр, текст мешать
 * не должен.
 */
export const TEXT_APPEAR_DELAY_SECONDS = 5;
/** Плавность появления подписи после задержки. */
export const TEXT_FADE_IN_SECONDS = 1;

/** Строк цитаты в кадре ролика — меньше, чем у открытки: кадр не должен
 *  становиться стеной текста, есть кнопка «Развернуть» в самой ленте. */
export const REEL_MAX_QUOTE_LINES = 4;

/**
 * Собирает вход для оверлея ролика.
 *
 * Вынесено чистой функцией по той же причине, что и `buildStoryVideoArgs`:
 * проверить лимит строк можно без мока всего воркера и без запуска ffmpeg.
 */
export function buildReelOverlayInput(
  text: string,
  attribution: string,
): StoryOverlayInput {
  return { text, attribution, maxQuoteLines: REEL_MAX_QUOTE_LINES };
}

export function buildStoryVideoArgs(input: StoryVideoArgs): string[] {
  // Задержка перед подписью не отнимает время на чтение — она добавляется
  // к уже рассчитанной длине ролика, а не вычитается из неё.
  const loop = input.loopToSeconds
    ? input.loopToSeconds + TEXT_APPEAR_DELAY_SECONDS
    : undefined;
  return [
    '-y',
    // Повтор задаётся до входа, а не фильтром: так ffmpeg крутит уже
    // декодированный файл, не перечитывая его с диска на каждом круге.
    ...(loop ? ['-stream_loop', '-1'] : []),
    '-i',
    input.videoPath,
    // Подпись — один кадр; без -loop у fade ниже была бы всего одна точка
    // времени на входе, и прозрачность не менялась бы по ходу ролика.
    '-loop',
    '1',
    '-i',
    input.overlayPath,
    ...(input.voicePath ? ['-i', input.voicePath] : []),
    ...(input.musicPath ? ['-i', input.musicPath] : []),
    // Ролик приходит от модели меньшего размера (замер: 704×1248), поэтому
    // сначала докадрируем до 1080×1920 — иначе подпись, свёрстанная под этот
    // кадр, не совпадёт с картинкой.
    '-filter_complex',
    `[0:v]scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${STORY_WIDTH}:${STORY_HEIGHT}[bg];` +
      // Первые TEXT_APPEAR_DELAY_SECONDS кадр идёт голым, дальше подпись
      // мягко проявляется — человек успевает сначала посмотреть на сам кадр.
      `[1:v]format=yuva420p,fade=t=in:st=${TEXT_APPEAR_DELAY_SECONDS}:d=${TEXT_FADE_IN_SECONDS}:alpha=1[ov];` +
      `[bg][ov]overlay=0:0[v]` +
      buildAudioFilter(input, loop),
    '-map',
    '[v]',
    // Со своей дорожкой берём её, иначе переносим звук ролика. `?` не даёт
    // ffmpeg упасть на немом файле.
    ...(input.voicePath || input.musicPath
      ? ['-map', '[a]']
      : ['-map', '0:a?']),
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
    ...(input.voicePath || input.musicPath
      ? ['aac', '-b:a', '160k']
      : ['copy']),
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
        : reject(
            new Error(`ffmpeg exited with ${code}: ${stderr.slice(-400)}`),
          ),
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
    /** Готовые дорожки в памяти: воркер получает их от провайдера, не файлом. */
    voice?: Buffer;
    music?: Buffer;
    musicVolume?: number;
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
    let voicePath: string | undefined;
    if (options?.voice) {
      voicePath = join(dir, 'voice.mp3');
      await writeFile(voicePath, options.voice);
    }
    let musicPath: string | undefined;
    if (options?.music) {
      musicPath = join(dir, 'music.mp3');
      await writeFile(musicPath, options.music);
    }

    let source = videoPath;
    if (options?.loopToSeconds) {
      source = join(dir, 'boomerang.mp4');
      await runFfmpeg(buildBoomerangArgs({ videoPath, outputPath: source }));
    }

    await runFfmpeg(
      buildStoryVideoArgs({
        videoPath: source,
        overlayPath,
        outputPath,
        loopToSeconds: options?.loopToSeconds,
        voicePath,
        musicPath,
        musicVolume: options?.musicVolume,
      }),
    );
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
