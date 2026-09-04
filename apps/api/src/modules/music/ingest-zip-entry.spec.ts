import {
  INGEST_ZIP_MAX_ENTRIES,
  INGEST_ZIP_MAX_TOTAL_BYTES,
  acceptZipEntry,
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
