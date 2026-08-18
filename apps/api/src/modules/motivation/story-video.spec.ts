import { buildStoryVideoArgs, ffmpegPath } from './story-video';
import { STORY_HEIGHT, STORY_WIDTH } from './story-image';

describe('buildStoryVideoArgs', () => {
  const args = buildStoryVideoArgs({
    videoPath: '/tmp/in.mp4',
    overlayPath: '/tmp/overlay.png',
    outputPath: '/tmp/out.mp4',
  });
  const filter = args[args.indexOf('-filter_complex') + 1];

  it('первым входом берёт ролик, вторым — подпись', () => {
    expect(args.indexOf('-i')).toBeLessThan(args.lastIndexOf('-i'));
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/in.mp4');
    expect(args[args.lastIndexOf('-i') + 1]).toBe('/tmp/overlay.png');
  });

  it('докадрирует ролик до размера сторис перед наложением', () => {
    // Модель отдаёт кадр меньше и другого соотношения (замер: 704×1248).
    // Без crop подпись, свёрстанная под 1080×1920, не совпала бы с картинкой.
    expect(filter).toContain(
      `scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=increase`,
    );
    expect(filter).toContain(`crop=${STORY_WIDTH}:${STORY_HEIGHT}`);
    expect(filter.indexOf('scale=')).toBeLessThan(filter.indexOf('overlay='));
  });

  it('кладёт подпись в левый верхний угол кадра целиком', () => {
    expect(filter).toContain('[bg][1:v]overlay=0:0[v]');
  });

  it('переносит звук, но не падает на немом ролике', () => {
    expect(args).toContain('0:a?');
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
  });

  it('оставляет yuv420p и faststart — без них ролик не играет у зрителя', () => {
    // yuv420p: Safari и предпросмотр Telegram не показывают другие форматы.
    // faststart: без индекса в начале браузер ждёт полной загрузки файла.
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
  });

  it('перезаписывает выходной файл и кладёт его последним аргументом', () => {
    expect(args[0]).toBe('-y');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });
});

describe('ffmpegPath', () => {
  const original = process.env.FFMPEG_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  it('по умолчанию берёт ffmpeg с PATH', () => {
    delete process.env.FFMPEG_PATH;
    expect(ffmpegPath()).toBe('ffmpeg');
  });

  it('уважает override — в образе и на машине разработчика пути разные', () => {
    process.env.FFMPEG_PATH = 'C:\tools\ffmpeg.exe';
    expect(ffmpegPath()).toBe('C:\tools\ffmpeg.exe');
  });
});
