import { CHAT_MOMENT_VIDEO_MAX_SECONDS } from '@vedamatch/shared';
import {
  buildPosterArgs,
  buildProbeArgs,
  denyDuration,
  ffmpegPath,
  ffprobePath,
  parseProbe,
} from './moments-video';

describe('пути утилит', () => {
  const before = { ...process.env };
  afterEach(() => {
    process.env = { ...before };
  });

  it('по умолчанию берутся с PATH', () => {
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    expect(ffmpegPath()).toBe('ffmpeg');
    expect(ffprobePath()).toBe('ffprobe');
  });

  it('переопределяются переменной окружения', () => {
    process.env.FFMPEG_PATH = '/opt/ffmpeg';
    expect(ffmpegPath()).toBe('/opt/ffmpeg');
  });

  it('пустая переменная не делает путь пустой строкой', () => {
    process.env.FFMPEG_PATH = '   ';
    expect(ffmpegPath()).toBe('ffmpeg');
  });
});

describe('аргументы постера', () => {
  const args = buildPosterArgs({ videoPath: '/tmp/a.mp4', posterPath: '/tmp/a.png' });

  it('перематывает до входа, а не после: иначе декодируется всё начало', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });

  it('берёт кадр не с нулевой секунды — первый кадр съёмки часто чёрный', () => {
    expect(args[args.indexOf('-ss') + 1]).toBe('0.1');
  });

  it('берёт ровно один кадр и перезаписывает файл', () => {
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
    expect(args).toContain('-y');
  });

  it('пути идут значениями своих ключей, а не склеены в строку', () => {
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/a.mp4');
    expect(args[args.length - 1]).toBe('/tmp/a.png');
  });

  it('кадр выходит в PNG: webp есть не в каждой сборке ffmpeg', () => {
    expect(args[args.indexOf('-c:v') + 1]).toBe('png');
  });
});

describe('аргументы ffprobe', () => {
  it('спрашивает длительность и размер первой видеодорожки', () => {
    const args = buildProbeArgs('/tmp/a.mp4');
    expect(args[args.indexOf('-select_streams') + 1]).toBe('v:0');
    expect(args[args.indexOf('-show_entries') + 1]).toBe(
      'format=duration:stream=width,height',
    );
    expect(args[args.length - 1]).toBe('/tmp/a.mp4');
  });
});

describe('разбор ответа ffprobe', () => {
  it('читает длительность и размер', () => {
    expect(parseProbe('width=1080\nheight=1920\nduration=12.480000\n')).toEqual({
      durationSec: 12,
      width: 1080,
      height: 1920,
    });
  });

  it('неполный ответ не роняет разбор', () => {
    expect(parseProbe('duration=5.0\n')).toEqual({
      durationSec: 5,
      width: null,
      height: null,
    });
  });

  it('мусор и «N/A» читаются как «неизвестно»', () => {
    expect(parseProbe('duration=N/A\nwidth=\n')).toEqual({
      durationSec: null,
      width: null,
      height: null,
    });
  });

  it('пустой ответ читается как «неизвестно»', () => {
    expect(parseProbe('')).toEqual({
      durationSec: null,
      width: null,
      height: null,
    });
  });
});

describe('проверка длительности', () => {
  it('нормальный ролик проходит', () => {
    expect(denyDuration(10)).toBeNull();
    expect(denyDuration(CHAT_MOMENT_VIDEO_MAX_SECONDS)).toBeNull();
  });

  it('длинный отбивается с внятным текстом', () => {
    expect(denyDuration(CHAT_MOMENT_VIDEO_MAX_SECONDS + 1)).toContain('длиннее');
  });

  it('нечитаемый файл объясняется человеку, а не молча принимается', () => {
    expect(denyDuration(null)).toContain('Не удалось прочитать');
  });

  it('файл без видеодорожки отбивается', () => {
    expect(denyDuration(0)).toBe('В ролике нет видео');
  });
});
