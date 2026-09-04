/**
 * Какие записи архива берём при редакционном пополнении.
 *
 * Чужой zip — это недоверенный ввод: имена записей внутри него пишет тот, кто
 * собирал архив, и `../../etc/passwd` там такое же законное имя, как
 * `01.mp3`. Правила вынесены сюда чистой функцией, потому что распаковщик
 * (задача 10) проверить тестом трудно, а ошибка в правилах молча уводит файл
 * мимо каталога.
 */

/** Двести дорожек — это уже не альбом, а чей-то целый диск. */
export const INGEST_ZIP_MAX_ENTRIES = 200;

/**
 * Четыре гигабайта распакованного на архив. Предел стоит именно на
 * распакованном объёме: архив на сорок килобайт разворачивается в гигабайты
 * нулей, и проверять его собственный размер бесполезно.
 */
export const INGEST_ZIP_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

/** Расширения, которые проходят те же пределы, что и ручная загрузка. */
const AUDIO_EXTENSIONS = ['.mp3', '.m4a'];

export interface IngestZipEntry {
  /** Имя записи так, как оно записано в архиве. */
  path: string;
  /** Объём в распакованном виде, как его заявляет запись. */
  sizeBytes: number;
}

/** Сколько уже взято из этого архива. */
export interface IngestZipSeen {
  count: number;
  totalBytes: number;
}

/**
 * `take` — аудио, которое кладём в партию. `skip` — прочее содержимое:
 * обложки, тексты, мусор macOS, вложенные архивы, каталоги. `reject` — то,
 * из-за чего распаковка останавливается целиком.
 *
 * Разница между `skip` и `reject` важнее, чем кажется: чужой архив всегда
 * содержит лишнее, и падать на `cover.jpg` нельзя, а на `../` — обязательно.
 */
export type ZipEntryVerdict = 'take' | 'skip' | 'reject';

/** Имя записи с разделителями Windows, приведённое к одному виду. */
function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Запись пытается выбраться за пределы каталога распаковки.
 *
 * Проверяется не строка целиком, а каждый сегмент: `album/../../etc` внешне
 * начинается безобидно. Разделители Windows приводятся к прямым слэшам,
 * потому что распаковщик на них тоже разделит путь.
 */
function escapesRoot(path: string): boolean {
  // Ноль-байт обрезает имя в системных вызовах: «a.mp3\0.jpg» пройдёт
  // проверку расширения, а на диск ляжет как «a.mp3».
  if (path.includes('\0')) return true;

  const unified = normalizeSeparators(path);
  // Абсолютный путь и буква диска игнорируют каталог распаковки целиком.
  if (unified.startsWith('/')) return true;
  if (/^[a-zA-Z]:/.test(unified)) return true;

  return unified.split('/').includes('..');
}

function baseName(path: string): string {
  const parts = normalizeSeparators(path).split('/');
  return parts[parts.length - 1] ?? '';
}

/**
 * Служебное содержимое, которого в архивах с музыкой всегда хватает: папка
 * `__MACOSX` с двойниками `._`, `.DS_Store`, `Thumbs.db`.
 */
function isJunk(path: string): boolean {
  const segments = normalizeSeparators(path).split('/');
  if (segments.includes('__MACOSX')) return true;
  const name = baseName(path);
  // Скрытые файлы целиком: и двойники `._01.mp3`, и `.DS_Store`.
  return name.startsWith('.');
}

function isAudio(path: string): boolean {
  const name = baseName(path).toLowerCase();
  return AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Брать ли запись архива. `seen` — то, что уже взято из этого же архива:
 * пределы считаются по взятому, а не по объявленному в оглавлении, потому
 * что обложки и каталоги мы не распаковываем и места они не занимают.
 */
export function acceptZipEntry(
  entry: IngestZipEntry,
  seen: IngestZipSeen,
): ZipEntryVerdict {
  const path = typeof entry.path === 'string' ? entry.path : '';

  // Путь наружу — первым делом: такой архив дальше не разбирается вовсе,
  // даже если конкретная запись оказалась бы обложкой.
  if (escapesRoot(path)) return 'reject';

  const name = baseName(path);
  // Пустое имя — это каталог: «album/» после разбиения даёт хвост «».
  if (name.length === 0) return 'skip';
  if (isJunk(path)) return 'skip';
  // Вложенные архивы не раскрываем: рекурсия по чужому zip — это способ
  // обойти оба потолка сразу.
  if (!isAudio(path)) return 'skip';

  const size = Number.isFinite(entry.sizeBytes) ? Math.max(0, entry.sizeBytes) : 0;
  if (seen.count >= INGEST_ZIP_MAX_ENTRIES) return 'reject';
  if (seen.totalBytes + size > INGEST_ZIP_MAX_TOTAL_BYTES) return 'reject';

  return 'take';
}
