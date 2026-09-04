import {
  extractEmbeddedCover,
  fallbackTrackTitle,
  normalizeAudioMetadata,
} from './music-metadata-parse';

describe('normalizeAudioMetadata', () => {
  it('переводит биты в секунду в килобиты', () => {
    const result = normalizeAudioMetadata({ format: { bitrate: 192000 } });

    expect(result.bitrateKbps).toBe(192);
  });

  it('среднее у VBR округляет, а не отбрасывает', () => {
    expect(
      normalizeAudioMetadata({ format: { bitrate: 191600 } }).bitrateKbps,
    ).toBe(192);
  });

  it('дробную длительность округляет до секунд', () => {
    expect(
      normalizeAudioMetadata({ format: { duration: 198.44 } }).durationSeconds,
    ).toBe(198);
  });

  it('на пустом и битом ответе не падает', () => {
    for (const raw of [null, undefined, {}, { format: {}, common: {} }]) {
      expect(normalizeAudioMetadata(raw)).toEqual({
        durationSeconds: null,
        bitrateKbps: null,
        title: null,
        artist: null,
        album: null,
        year: null,
        language: null,
        trackNumber: null,
      });
    }
  });

  it('нулевую и отрицательную длительность считает непрочитанной', () => {
    expect(
      normalizeAudioMetadata({ format: { duration: 0 } }).durationSeconds,
    ).toBeNull();
    expect(
      normalizeAudioMetadata({ format: { duration: -5 } }).durationSeconds,
    ).toBeNull();
  });

  it('NaN и Infinity в длительности не пролезают', () => {
    expect(
      normalizeAudioMetadata({ format: { duration: Number.NaN } })
        .durationSeconds,
    ).toBeNull();
    expect(
      normalizeAudioMetadata({ format: { bitrate: Number.POSITIVE_INFINITY } })
        .bitrateKbps,
    ).toBeNull();
  });

  describe('теги', () => {
    it('чистит нулевые байты и BOM от старых кодировщиков', () => {
      const result = normalizeAudioMetadata({
        common: { title: '\u0000Джая Радха-Мадхава\ufeff' },
      });

      expect(result.title).toBe('Джая Радха-Мадхава');
    });

    it('схлопывает пробелы и обрезает края', () => {
      expect(
        normalizeAudioMetadata({ common: { title: '  Гаура   арати  ' } })
          .title,
      ).toBe('Гаура арати');
    });

    it('пустой тег — это отсутствие тега', () => {
      expect(
        normalizeAudioMetadata({ common: { title: '   ' } }).title,
      ).toBeNull();
    });

    it('режет неприлично длинный тег', () => {
      const long = 'а'.repeat(500);

      expect(
        normalizeAudioMetadata({ common: { title: long } }).title,
      ).toHaveLength(200);
    });

    it('из списка исполнителей берёт первого', () => {
      expect(
        normalizeAudioMetadata({
          common: { artists: ['Аударья Дхама дас', 'Хор'] },
        }).artist,
      ).toBe('Аударья Дхама дас');
    });

    it('одиночный artist важнее списка', () => {
      expect(
        normalizeAudioMetadata({
          common: { artist: 'Према Бхакти д. д.', artists: ['Кто-то ещё'] },
        }).artist,
      ).toBe('Према Бхакти д. д.');
    });
  });

  describe('год', () => {
    it('разумный пропускает', () => {
      expect(normalizeAudioMetadata({ common: { year: 2026 } }).year).toBe(
        2026,
      );
    });

    it('мусор в теге отбрасывает', () => {
      expect(normalizeAudioMetadata({ common: { year: 0 } }).year).toBeNull();
      expect(
        normalizeAudioMetadata({ common: { year: 99999 } }).year,
      ).toBeNull();
      expect(
        normalizeAudioMetadata({ common: { year: 1826.5 } }).year,
      ).toBeNull();
    });
  });

  describe('номер дорожки', () => {
    it('берёт номер из пары «который из скольких»', () => {
      expect(
        normalizeAudioMetadata({ common: { track: { no: 3, of: 12 } } })
          .trackNumber,
      ).toBe(3);
    });

    it('пустой тег — это отсутствие номера, а не нулевая дорожка', () => {
      expect(normalizeAudioMetadata({}).trackNumber).toBeNull();
      expect(
        normalizeAudioMetadata({ common: { track: { no: null } } })
          .trackNumber,
      ).toBeNull();
      expect(
        normalizeAudioMetadata({ common: { track: { no: 0 } } }).trackNumber,
      ).toBeNull();
    });

    it('отбрасывает год, заехавший в поле номера, и дробь', () => {
      expect(
        normalizeAudioMetadata({ common: { track: { no: 2024 } } })
          .trackNumber,
      ).toBeNull();
      expect(
        normalizeAudioMetadata({ common: { track: { no: 1.5 } } }).trackNumber,
      ).toBeNull();
    });
  });
});

describe('fallbackTrackTitle', () => {
  const empty = normalizeAudioMetadata(null);

  it('тег важнее имени файла', () => {
    const withTitle = normalizeAudioMetadata({
      common: { title: 'Гаура-арати' },
    });

    expect(fallbackTrackTitle(withTitle, 'track01.mp3')).toBe('Гаура-арати');
  });

  it('без тега берёт имя файла без расширения', () => {
    expect(fallbackTrackTitle(empty, 'Джая Радха-Мадхава.mp3')).toBe(
      'Джая Радха-Мадхава',
    );
  });

  it('отбрасывает путь', () => {
    expect(fallbackTrackTitle(empty, 'C:\\music\\kirtan\\gaura.m4a')).toBe(
      'gaura',
    );
    expect(fallbackTrackTitle(empty, '/tmp/uploads/gaura.mp3')).toBe('gaura');
  });

  it('когда взять нечего — говорит об этом прямо', () => {
    expect(fallbackTrackTitle(empty, '')).toBe('Без названия');
    expect(fallbackTrackTitle(empty, '.mp3')).toBe('Без названия');
  });
});

describe('extractEmbeddedCover', () => {
  const bytes = (length: number) => new Uint8Array(length).fill(1);
  const MAX = 2 * 1024 * 1024;

  it('без картинок в теге возвращает null', () => {
    expect(extractEmbeddedCover({ common: {} }, MAX)).toBeNull();
    expect(extractEmbeddedCover(null, MAX)).toBeNull();
  });

  it('берёт картинку и приводит тип к нашему mime', () => {
    const cover = extractEmbeddedCover(
      { common: { picture: [{ format: 'JPG', data: bytes(10) }] } },
      MAX,
    );
    expect(cover?.mime).toBe('image/jpeg');
    expect(cover?.data.byteLength).toBe(10);
  });

  it('предпочитает переднюю сторону, а не первую по порядку', () => {
    // В файле бывает несколько картинок — задняя обложка, разворот, фото
    // исполнителя. Первая по порядку не обязательно та, что нужна плитке.
    const cover = extractEmbeddedCover(
      {
        common: {
          picture: [
            { format: 'image/png', type: 'Back Cover', data: bytes(4) },
            { format: 'image/jpeg', type: 'Cover (front)', data: bytes(9) },
          ],
        },
      },
      MAX,
    );
    expect(cover?.mime).toBe('image/jpeg');
    expect(cover?.data.byteLength).toBe(9);
  });

  it('пропускает чужие типы и пустые данные', () => {
    expect(
      extractEmbeddedCover(
        {
          common: {
            picture: [
              { format: 'image/gif', data: bytes(10) },
              { format: 'image/jpeg', data: bytes(0) },
            ],
          },
        },
        MAX,
      ),
    ).toBeNull();
  });

  it('не пропускает мимо потолка размера', () => {
    // Обложка из файла не должна пролезать мимо правила, по которому
    // отказывают человеку при ручной загрузке.
    expect(
      extractEmbeddedCover(
        { common: { picture: [{ format: 'image/jpeg', data: bytes(50) }] } },
        10,
      ),
    ).toBeNull();
  });
});
