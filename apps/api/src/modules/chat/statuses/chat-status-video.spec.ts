import { buildStatusPosterArgs, parseFfmpegInfo } from './chat-status-video';

/** Настоящий вывод ffmpeg 8 при снятии кадра с ролика 720×1280. */
const PORTRAIT = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'test.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:04.00, start: 0.000000, bitrate: 165 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 720x1280 [SAR 1:1 DAR 9:16], 86 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
Stream mapping:
  Stream #0:0 -> #0:0 (h264 (native) -> png (native))
Output #0, image2, to 'poster.png':
  Stream #0:0(und): Video: png, rgb24(pc, gbr/unknown/unknown, progressive), 640x360, q=2-31, 200 kb/s
`;

describe('buildStatusPosterArgs', () => {
  it('seeks before the input, takes one frame and writes png', () => {
    const args = buildStatusPosterArgs({
      videoPath: '/t/in.mp4',
      posterPath: '/t/p.png',
    });
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toEqual(
      expect.arrayContaining(['-frames:v', '1', '-c:v', 'png']),
    );
    expect(args[args.indexOf('-i') + 1]).toBe('/t/in.mp4');
    expect(args.at(-1)).toBe('/t/p.png');
  });

  // На уровне error ffmpeg молчит о входе, и разбирать было бы нечего.
  it('keeps the info log level that prints the input', () => {
    const args = buildStatusPosterArgs({ videoPath: 'a', posterPath: 'b' });
    expect(args[args.indexOf('-loglevel') + 1]).toBe('info');
  });
});

describe('parseFfmpegInfo', () => {
  it('reads the duration and the input frame size', () => {
    expect(parseFfmpegInfo(PORTRAIT)).toEqual({
      durationSec: 4,
      width: 720,
      height: 1280,
    });
  });

  // Размер обложки на выходе — не размер ролика.
  it('ignores the output stream', () => {
    expect(parseFfmpegInfo(PORTRAIT).width).toBe(720);
  });

  it('rounds long durations and keeps a sub-second clip at one second', () => {
    expect(parseFfmpegInfo('  Duration: 01:02:03.60, start').durationSec).toBe(
      3724,
    );
    expect(parseFfmpegInfo('  Duration: 00:00:00.40, start').durationSec).toBe(
      1,
    );
  });

  // Вертикальный ролик с телефона пишется горизонтальным с поворотом.
  it('swaps the sides of a rotated phone video', () => {
    const rotated = `  Duration: 00:00:10.00, start: 0
  Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
    Side data:
      displaymatrix: rotation of -90.00 degrees
Output #0, image2, to 'p.png':`;
    expect(parseFfmpegInfo(rotated)).toEqual({
      durationSec: 10,
      width: 1080,
      height: 1920,
    });
  });

  it('returns nulls for output it does not understand', () => {
    expect(parseFfmpegInfo('garbage')).toEqual({
      durationSec: null,
      width: null,
      height: null,
    });
    expect(
      parseFfmpegInfo('Duration: N/A, bitrate: N/A').durationSec,
    ).toBeNull();
  });
});
