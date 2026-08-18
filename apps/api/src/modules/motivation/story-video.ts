import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  buildStoryOverlaySvg,
  type StoryOverlayInput,
} from './story-image';

/**
 * Путь к ffmpeg. В образе он ставится через apk и лежит на PATH; на машине
 * разработчика может быть где угодно, поэтому есть override переменной.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export type StoryVideoArgs = {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
};

/**
 * Аргументы ffmpeg для кадра сторис поверх ролика.
 *
 * Вынесено чистой функцией по той же причине, что и `buildStoryOverlaySvg`:
 * запускать кодек в тестах незачем, а порядок фильтров и флагов ломается
 * молча — видео просто уезжает по краям или не играет в браузере.
 */
export function buildStoryVideoArgs(input: StoryVideoArgs): string[] {
  return [
    '-y',
    '-i',
    input.videoPath,
    '-i',
    input.overlayPath,
    // Ролик приходит от модели меньшего размера (замер: 704×1248), поэтому
    // сначала докадрируем до 1080×1920 — иначе подпись, свёрстанная под этот
    // кадр, не совпадёт с картинкой.
    '-filter_complex',
    `[0:v]scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${STORY_WIDTH}:${STORY_HEIGHT}[bg];[bg][1:v]overlay=0:0[v]`,
    '-map',
    '[v]',
    // Звук переносим, если он есть: `?` не даёт ffmpeg упасть на немом ролике.
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    // Без yuv420p ролик не играет в Safari и в предпросмотре Telegram.
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    // Индекс в начало файла: иначе браузер ждёт полной загрузки перед стартом.
    '-movflags',
    '+faststart',
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
): Promise<Buffer> {
  const overlayPng = await sharp(
    Buffer.from(buildStoryOverlaySvg(overlay)),
  )
    .png()
    .toBuffer();

  const dir = await mkdtemp(join(tmpdir(), 'vm-story-'));
  try {
    const videoPath = join(dir, 'in.mp4');
    const overlayPath = join(dir, 'overlay.png');
    const outputPath = join(dir, 'out.mp4');
    await writeFile(videoPath, video);
    await writeFile(overlayPath, overlayPng);
    await runFfmpeg(buildStoryVideoArgs({ videoPath, overlayPath, outputPath }));
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
