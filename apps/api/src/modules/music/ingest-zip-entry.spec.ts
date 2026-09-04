import {
  INGEST_ZIP_MAX_ARCHIVE_BYTES,
  INGEST_ZIP_MAX_ENTRIES,
  INGEST_ZIP_MAX_TOTAL_BYTES,
  acceptZipEntry,
  checkIngestArchive,
  zipRejectionReason,
} from './ingest-zip-entry';

const seen = (over = {}) => ({ count: 0, totalBytes: 0, ...over });

describe('acceptZipEntry', () => {
  it('берёт mp3 и m4a', () => {
    expect(acceptZipEntry({ path: 'album/01.mp3', sizeBytes: 100 }, seen())).toBe('take');
    expect(acceptZipEntry({ path: 'album/02.m4a', sizeBytes: 100 }, seen())).toBe('take');
  });

  it('молча пропускает обложки и служебное', () => {
    // Не ошибка: в архивах всегда лежат cover.jpg и мусор macOS.
    expect(acceptZipEntry({ path: 'album/cover.jpg', sizeBytes: 10 }, seen())).toBe('skip');
    expect(acceptZipEntry({ path: '__MACOSX/._01.mp3', sizeBytes: 10 }, seen())).toBe('skip');
    expect(acceptZipEntry({ path: 'album/', sizeBytes: 0 }, seen())).toBe('skip');
  });

  it('отбивает выход за пределы каталога', () => {
    expect(acceptZipEntry({ path: '../../etc/passwd.mp3', sizeBytes: 10 }, seen())).toBe('reject');
    expect(acceptZipEntry({ path: '/etc/passwd.mp3', sizeBytes: 10 }, seen())).toBe('reject');
    expect(acceptZipEntry({ path: 'C:\\Windows\\a.mp3', sizeBytes: 10 }, seen())).toBe('reject');
  });

  it('игнорирует вложенные архивы, а не раскрывает их', () => {
    expect(acceptZipEntry({ path: 'album/more.zip', sizeBytes: 10 }, seen())).toBe('skip');
  });

  it('отбивает архив, у которого слишком много записей', () => {
    expect(
      acceptZipEntry({ path: 'a.mp3', sizeBytes: 10 }, seen({ count: INGEST_ZIP_MAX_ENTRIES })),
    ).toBe('reject');
  });

  it('отбивает распаковку, переросшую потолок: это zip-бомба', () => {
    expect(
      acceptZipEntry(
        { path: 'a.mp3', sizeBytes: 1024 },
        seen({ totalBytes: INGEST_ZIP_MAX_TOTAL_BYTES }),
      ),
    ).toBe('reject');
  });
});

// Ниже — случаи сверх плана: те же приёмы, записанные иначе.
describe('acceptZipEntry: обходные записи того же пути', () => {
  it('видит выход наружу через разделители Windows и середину пути', () => {
    expect(acceptZipEntry({ path: 'album\\..\\..\\a.mp3', sizeBytes: 10 }, seen())).toBe(
      'reject',
    );
    expect(acceptZipEntry({ path: 'album/../../a.mp3', sizeBytes: 10 }, seen())).toBe(
      'reject',
    );
    expect(
      acceptZipEntry({ path: '\\\\server\\share\\a.mp3', sizeBytes: 10 }, seen()),
    ).toBe('reject');
  });

  it('отбивает ноль-байт в имени', () => {
    // Системный вызов обрежет имя по нулю, и проверенное расширение отвалится.
    expect(acceptZipEntry({ path: 'a.mp3\u0000.jpg', sizeBytes: 10 }, seen())).toBe('reject');
  });

  it('не путает похожее с выходом наружу', () => {
    expect(acceptZipEntry({ path: '..hidden/a.mp3', sizeBytes: 10 }, seen())).toBe('take');
    expect(acceptZipEntry({ path: 'album/a..b.mp3', sizeBytes: 10 }, seen())).toBe('take');
  });

  it('берёт аудио независимо от регистра расширения', () => {
    expect(acceptZipEntry({ path: 'album/01.MP3', sizeBytes: 10 }, seen())).toBe('take');
  });

  it('пропускает скрытое и мусор Windows', () => {
    expect(acceptZipEntry({ path: 'album/.DS_Store', sizeBytes: 10 }, seen())).toBe('skip');
    expect(acceptZipEntry({ path: 'album/Thumbs.db', sizeBytes: 10 }, seen())).toBe('skip');
  });

  it('пускает последнюю запись, которая ровно укладывается в потолки', () => {
    // Граница именно «больше», а не «столько же»: иначе последняя дорожка
    // альбома срывала бы весь архив.
    expect(
      acceptZipEntry(
        { path: 'a.mp3', sizeBytes: 1024 },
        seen({ count: INGEST_ZIP_MAX_ENTRIES - 1, totalBytes: INGEST_ZIP_MAX_TOTAL_BYTES - 1024 }),
      ),
    ).toBe('take');
  });
});

describe('zipRejectionReason', () => {
  it('называет путь наружу, а не «не удалось»', () => {
    expect(zipRejectionReason({ path: '../../etc/passwd.mp3', sizeBytes: 10 }, seen())).toContain(
      'путём наружу',
    );
  });

  it('различает переполнение по числу записей и по объёму', () => {
    // Две разные новости для админа: в первом случае архив не тот, во
    // втором — его нужно разбить на части.
    expect(
      zipRejectionReason({ path: 'a.mp3', sizeBytes: 10 }, seen({ count: INGEST_ZIP_MAX_ENTRIES })),
    ).toBe(`В архиве больше ${INGEST_ZIP_MAX_ENTRIES} записей`);
    expect(
      zipRejectionReason(
        { path: 'a.mp3', sizeBytes: 1024 },
        seen({ totalBytes: INGEST_ZIP_MAX_TOTAL_BYTES }),
      ),
    ).toBe('Распакованный архив больше 4 ГБ');
  });
});

describe('checkIngestArchive', () => {
  it('пускает .zip любого регистра', () => {
    expect(checkIngestArchive({ fileName: 'album.zip', sizeBytes: 1024 })).toBeNull();
    expect(checkIngestArchive({ fileName: 'Album.ZIP', sizeBytes: 1024 })).toBeNull();
  });

  it('отбивает чужие форматы: разбирать их нечем', () => {
    expect(checkIngestArchive({ fileName: 'album.rar', sizeBytes: 1024 })).toBe('not_zip');
    expect(checkIngestArchive({ fileName: 'album.7z', sizeBytes: 1024 })).toBe('not_zip');
    expect(checkIngestArchive({ fileName: 'album', sizeBytes: 1024 })).toBe('not_zip');
  });

  it('отбивает пустой и нечисловой размер', () => {
    expect(checkIngestArchive({ fileName: 'a.zip', sizeBytes: 0 })).toBe('archive_empty');
    expect(checkIngestArchive({ fileName: 'a.zip', sizeBytes: Number.NaN })).toBe('archive_empty');
  });

  it('отбивает архив выше потолка, но пускает ровно потолок', () => {
    expect(
      checkIngestArchive({ fileName: 'a.zip', sizeBytes: INGEST_ZIP_MAX_ARCHIVE_BYTES + 1 }),
    ).toBe('archive_too_large');
    expect(
      checkIngestArchive({ fileName: 'a.zip', sizeBytes: INGEST_ZIP_MAX_ARCHIVE_BYTES }),
    ).toBeNull();
  });
});
