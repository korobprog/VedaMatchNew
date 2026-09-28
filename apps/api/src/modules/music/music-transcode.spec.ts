import {
  buildFfprobeArgs,
  buildTranscodeArgs,
  chooseTranscodeBitrateKbps,
  outputSampleRate,
  parseFfprobeOutput,
  parseTranscodeRequest,
  sniffTranscodeSource,
  transcodeStatusAfterFailure,
} from './music-transcode';

function bytes(...parts: (string | number[])[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      for (const char of part) out.push(char.charCodeAt(0));
    } else out.push(...part);
  }
  while (out.length < 64) out.push(0);
  return Uint8Array.from(out);
}

/** Первая страница Ogg: 27 байт заголовка, таблица сегментов, пакет. */
function oggPage(packet: string | number[], segments = 1): Uint8Array {
  const header = [...'OggS'].map((c) => c.charCodeAt(0));
  while (header.length < 26) header.push(0);
  header.push(segments);
  return bytes(header, new Array<number>(segments).fill(30), packet);
}

describe('sniffTranscodeSource', () => {
  it('FLAC по fLaC', () => {
    expect(sniffTranscodeSource(bytes('fLaC', [0, 0, 0, 34]))).toEqual({
      container: 'flac',
      mime: 'audio/flac',
    });
  });

  it('FLAC за ID3v2-тегом', () => {
    // Синхробезопасный размер 20 байт + 10 байт заголовка тега.
    const tag = bytes('ID3', [4, 0, 0, 0, 0, 0, 20], new Array(20).fill(0));
    const prefix = new Uint8Array(80);
    prefix.set(tag.subarray(0, 30), 0);
    prefix.set(bytes('fLaC').subarray(0, 4), 30);
    expect(sniffTranscodeSource(prefix)?.container).toBe('flac');
  });

  it('WAV по RIFF…WAVE и RF64…WAVE', () => {
    expect(
      sniffTranscodeSource(bytes('RIFF', [1, 2, 3, 4], 'WAVEfmt '))?.mime,
    ).toBe('audio/wav');
    expect(
      sniffTranscodeSource(bytes('RF64', [255, 255, 255, 255], 'WAVE'))
        ?.container,
    ).toBe('wav');
  });

  it('RIFF без WAVE — не звук (AVI, WebP)', () => {
    expect(sniffTranscodeSource(bytes('RIFF', [1, 2, 3, 4], 'AVI '))).toBe(
      null,
    );
    expect(sniffTranscodeSource(bytes('RIFF', [1, 2, 3, 4], 'WEBP'))).toBe(
      null,
    );
  });

  it('OGG с Vorbis, Opus и FLAC внутри', () => {
    expect(sniffTranscodeSource(oggPage('\x01vorbis'))?.mime).toBe('audio/ogg');
    expect(sniffTranscodeSource(oggPage('OpusHead'))?.container).toBe('ogg');
    expect(sniffTranscodeSource(oggPage('\x7fFLAC'))?.container).toBe('ogg');
  });

  it('пакет ищется за таблицей сегментов любой длины', () => {
    expect(sniffTranscodeSource(oggPage('OpusHead', 3))?.container).toBe('ogg');
  });

  it('OGG с видео (Theora) не берём', () => {
    expect(sniffTranscodeSource(oggPage('\x80theora'))).toBe(null);
  });

  it('mp3, m4a, пусто и короткое — не наш путь', () => {
    expect(sniffTranscodeSource(bytes('ID3', [4, 0, 0, 0, 0, 0, 0]))).toBe(
      null,
    );
    expect(sniffTranscodeSource(bytes([0, 0, 0, 32], 'ftypM4A '))).toBe(null);
    expect(sniffTranscodeSource(null)).toBe(null);
    expect(sniffTranscodeSource(Uint8Array.from([0x66, 0x4c]))).toBe(null);
  });
});

describe('ffprobe', () => {
  it('аргументы: JSON с длительностью и параметрами дорожки', () => {
    expect(buildFfprobeArgs('/tmp/x/source.flac')).toEqual([
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,sample_rate,channels',
      '-of',
      'json',
      '/tmp/x/source.flac',
    ]);
  });

  it('разбирает длительность и первую аудиодорожку', () => {
    const out = JSON.stringify({
      streams: [
        { codec_type: 'video' },
        { codec_type: 'audio', sample_rate: '96000', channels: 2 },
      ],
      format: { duration: '2400.466000' },
    });
    expect(parseFfprobeOutput(out)).toEqual({
      durationSeconds: 2400,
      sampleRate: 96000,
      channels: 2,
      hasAudio: true,
    });
  });

  it('без дорожки и без длительности — пусто, а не исключение', () => {
    expect(parseFfprobeOutput('{"streams":[],"format":{}}')).toEqual({
      durationSeconds: null,
      sampleRate: null,
      channels: null,
      hasAudio: false,
    });
    expect(parseFfprobeOutput('not json').hasAudio).toBe(false);
    expect(
      parseFfprobeOutput('{"format":{"duration":"N/A"}}').durationSeconds,
    ).toBe(null);
  });

  it('доля секунды не превращается в ноль', () => {
    expect(
      parseFfprobeOutput('{"format":{"duration":"0.3"}}').durationSeconds,
    ).toBe(1);
  });
});

describe('chooseTranscodeBitrateKbps', () => {
  const MB = 1024 * 1024;

  it('40-минутный киртан — 256 kbps в пределах 150 МБ', () => {
    expect(chooseTranscodeBitrateKbps(40 * 60, 150 * MB)).toBe(256);
  });

  it('длинная программа спускается по ступеням', () => {
    // 256 kbps × 90 мин ≈ 176 МБ — не влезает, 192 × 90 ≈ 132 МБ — влезает.
    expect(chooseTranscodeBitrateKbps(90 * 60, 150 * MB)).toBe(192);
    expect(chooseTranscodeBitrateKbps(3 * 60 * 60, 150 * MB)).toBe(96);
  });

  it('не помещается даже в 96 — отказ', () => {
    expect(chooseTranscodeBitrateKbps(4 * 60 * 60, 150 * MB)).toBe(null);
  });

  it('мусорная длительность — отказ', () => {
    expect(chooseTranscodeBitrateKbps(0, 150 * MB)).toBe(null);
    expect(chooseTranscodeBitrateKbps(Number.NaN, 150 * MB)).toBe(null);
  });
});

describe('buildTranscodeArgs', () => {
  const base = {
    inputPath: '/tmp/t/source.flac',
    outputPath: '/tmp/t/out.m4a',
    bitrateKbps: 256,
  };

  it('стерео 44.1 кГц — без пересэмплирования и сведения', () => {
    expect(
      buildTranscodeArgs({ ...base, sampleRate: 44_100, channels: 2 }),
    ).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      '/tmp/t/source.flac',
      '-map',
      '0:a:0',
      '-map_metadata',
      '0',
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      '/tmp/t/out.m4a',
    ]);
  });

  it('96 кГц пересэмплируется в 48, 5.1 сводится в стерео', () => {
    const args = buildTranscodeArgs({
      ...base,
      bitrateKbps: 192,
      sampleRate: 96_000,
      channels: 6,
    });
    expect(args).toEqual(expect.arrayContaining(['-b:a', '192k']));
    expect(args[args.indexOf('-ar') + 1]).toBe('48000');
    expect(args[args.indexOf('-ac') + 1]).toBe('2');
    // Выходной путь — последним: ffmpeg читает его как имя результата.
    expect(args.at(-1)).toBe('/tmp/t/out.m4a');
  });

  it('моно остаётся моно', () => {
    const args = buildTranscodeArgs({
      ...base,
      sampleRate: 48_000,
      channels: 1,
    });
    expect(args).not.toContain('-ac');
    expect(args).not.toContain('-ar');
  });

  it('outputSampleRate', () => {
    expect(outputSampleRate(null)).toBe(null);
    expect(outputSampleRate(48_000)).toBe(null);
    expect(outputSampleRate(88_200)).toBe(48_000);
  });
});

describe('transcodeStatusAfterFailure', () => {
  it('до третьей попытки — обратно в очередь, на третьей — отказ', () => {
    expect(transcodeStatusAfterFailure(1)).toBe('transcode_queued');
    expect(transcodeStatusAfterFailure(2)).toBe('transcode_queued');
    expect(transcodeStatusAfterFailure(3)).toBe('failed');
  });
});

describe('parseTranscodeRequest', () => {
  it('берёт только строки и явный true', () => {
    expect(
      parseTranscodeRequest({
        fileName: 'k.flac',
        lineage: 'iskcon',
        artistId: '',
        audiobookId: 42,
        canAssignArtist: 'true',
      }),
    ).toEqual({
      fileName: 'k.flac',
      lineage: 'iskcon',
      artistId: null,
      audiobookId: null,
      canAssignArtist: false,
    });
    expect(parseTranscodeRequest(null).canAssignArtist).toBe(false);
  });
});
