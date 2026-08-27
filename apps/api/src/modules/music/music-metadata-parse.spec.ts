import {
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
