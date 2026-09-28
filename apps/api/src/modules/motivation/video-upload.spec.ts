import {
  checkVideo,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  mp4DurationSeconds,
  normalizeVideoInput,
  resolveVideoDuration,
  sniffVideoContainer,
  videoContentType,
  videoKey,
  videoMessage,
  type UploadedVideo,
} from './video-upload';

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

function ftyp(brand: string): Buffer {
  return box('ftyp', Buffer.from(`${brand}\0\0\0\0isom`, 'latin1'));
}

/** mvhd версии 0: timescale и duration по 4 байта. */
function mvhd0(timescale: number, duration: number): Buffer {
  const payload = Buffer.alloc(20);
  payload.writeUInt32BE(timescale, 12);
  payload.writeUInt32BE(duration, 16);
  return box('mvhd', payload);
}

/** mvhd версии 1: 64-битные времена и длительность. */
function mvhd1(timescale: number, duration: number): Buffer {
  const payload = Buffer.alloc(32);
  payload[0] = 1;
  payload.writeUInt32BE(timescale, 20);
  payload.writeBigUInt64BE(BigInt(duration), 24);
  return box('mvhd', payload);
}

function mp4(seconds: number, brand = 'isom'): Buffer {
  return Buffer.concat([
    ftyp(brand),
    box('mdat', Buffer.alloc(16)),
    box('moov', mvhd0(1000, seconds * 1000)),
  ]);
}

const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(32),
]);

function file(
  buffer: Buffer,
  over: Partial<UploadedVideo> = {},
): UploadedVideo {
  return { buffer, mimetype: 'video/mp4', size: buffer.length, ...over };
}

describe('sniffVideoContainer', () => {
  it('различает mp4, mov и webm по содержимому', () => {
    expect(sniffVideoContainer(mp4(5))).toBe('mp4');
    expect(sniffVideoContainer(mp4(5, 'qt  '))).toBe('mov');
    expect(sniffVideoContainer(WEBM)).toBe('webm');
  });

  it('старый mov без ftyp тоже узнаёт', () => {
    expect(sniffVideoContainer(box('moov', mvhd0(600, 600 * 3)))).toBe('mov');
  });

  it('картинку и мусор не принимает, как бы файл ни назывался', () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    expect(sniffVideoContainer(png)).toBeNull();
    expect(sniffVideoContainer(Buffer.from('короткий'))).toBeNull();
    expect(sniffVideoContainer(Buffer.alloc(4))).toBeNull();
  });
});

describe('mp4DurationSeconds', () => {
  it('читает mvhd версии 0, даже когда moov в конце файла', () => {
    expect(mp4DurationSeconds(mp4(12))).toBe(12);
  });

  it('читает mvhd версии 1', () => {
    const buffer = Buffer.concat([
      ftyp('isom'),
      box('moov', mvhd1(90000, 90000 * 30)),
    ]);
    expect(mp4DurationSeconds(buffer)).toBe(30);
  });

  it('без moov или с битым боксом — неизвестно, а не падение', () => {
    expect(mp4DurationSeconds(ftyp('isom'))).toBeNull();
    const broken = Buffer.concat([
      ftyp('isom'),
      Buffer.from([0, 0, 0xff, 0xff, 0x6d, 0x6f, 0x6f, 0x76]),
    ]);
    expect(mp4DurationSeconds(broken)).toBeNull();
  });

  it('«длительность неизвестна» из потокового файла — null', () => {
    const buffer = Buffer.concat([
      ftyp('isom'),
      box('moov', mvhd0(1000, 0xffffffff)),
    ]);
    expect(mp4DurationSeconds(buffer)).toBeNull();
  });
});

describe('resolveVideoDuration', () => {
  it('своему разбору верит больше, чем форме', () => {
    expect(resolveVideoDuration(10, '999')).toBe(10);
  });

  it('без разбора берёт присланное браузером', () => {
    expect(resolveVideoDuration(null, '14.6')).toBe(14.6);
    expect(resolveVideoDuration(null, 7)).toBe(7);
  });

  it('ноль, пустое и мусор — неизвестно', () => {
    for (const claimed of [undefined, '', '0', 'abc', -3, Number.NaN])
      expect(resolveVideoDuration(null, claimed)).toBeNull();
  });
});

describe('checkVideo', () => {
  it('короткий mp4 проходит, длительность округляется', () => {
    expect(checkVideo(file(mp4(15)), undefined)).toEqual({
      ok: true,
      container: 'mp4',
      durationSeconds: 15,
    });
  });

  it('webm берёт длительность из формы', () => {
    expect(checkVideo(file(WEBM, { mimetype: 'video/webm' }), '20.4')).toEqual({
      ok: true,
      container: 'webm',
      durationSeconds: 20,
    });
  });

  it('webm без длительности не принимаем: лимит не проверить', () => {
    expect(checkVideo(file(WEBM), undefined)).toEqual({
      ok: false,
      problem: 'video_duration_unknown',
    });
  });

  it('длинный ролик отбивает, даже если форма врёт', () => {
    expect(checkVideo(file(mp4(MAX_VIDEO_SECONDS + 10)), '5')).toEqual({
      ok: false,
      problem: 'video_too_long',
    });
  });

  it('пустой, большой и не-видео отбивает по порядку', () => {
    expect(checkVideo(undefined, 5)).toEqual({
      ok: false,
      problem: 'video_missing',
    });
    expect(checkVideo(file(mp4(5), { size: MAX_VIDEO_BYTES + 1 }), 5)).toEqual({
      ok: false,
      problem: 'video_too_big',
    });
    expect(checkVideo(file(Buffer.alloc(64)), 5)).toEqual({
      ok: false,
      problem: 'video_type',
    });
  });

  it('у каждой проблемы есть человеческое объяснение', () => {
    for (const problem of [
      'video_missing',
      'video_type',
      'video_too_big',
      'video_duration_unknown',
      'video_too_long',
    ] as const)
      expect(videoMessage(problem)).toMatch(/\S/);
  });
});

describe('хранение', () => {
  it('mov отдаётся как mp4: иначе Chrome откажется ещё до загрузки', () => {
    expect(videoContentType('mov')).toBe('video/mp4');
    expect(videoContentType('mp4')).toBe('video/mp4');
    expect(videoContentType('webm')).toBe('video/webm');
  });

  it('ключ — по содержимому и со временем', () => {
    expect(videoKey('abc', 'webm', 42)).toBe('motivation/videos/abc-42.webm');
  });
});

describe('normalizeVideoInput', () => {
  it('чистит пробелы и режет длинное название', () => {
    expect(
      normalizeVideoInput({
        category: ' vedy ',
        title: `  a   b ${'x'.repeat(300)}`,
      }),
    ).toEqual({ category: 'vedy', title: `a b ${'x'.repeat(156)}` });
  });

  it('без полей — пустые строки, категорию решит справочник', () => {
    expect(normalizeVideoInput(undefined)).toEqual({ category: '', title: '' });
    expect(normalizeVideoInput({ category: 5 })).toEqual({
      category: '',
      title: '',
    });
  });
});
