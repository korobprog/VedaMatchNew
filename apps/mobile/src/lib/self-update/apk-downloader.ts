import { File, FileMode } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import VedamatchFileHash from '../../../modules/vedamatch-file-hash';
import { decodeBase64ToBytes } from './binary-utils';
import { cachedApkFileName, isOwnCachedApk, shouldDeleteCachedApk } from './cached-apk';
import { DEFAULT_HASH_CHUNK_BYTES, HashCancelledError, sha256InChunks } from './chunked-hash';
import { chooseHashPath, nativeHashFailureAction } from './hash-path';

/**
 * Скачивание и хеширование APK на диск (VED-176) — сетевой и файловый слой,
 * тестируется только на телефоне (`spec.md`, «Что проверяется только на
 * телефоне»): реальный `FileProvider`/`content://` эмуляция jest-expo не
 * покрывает. Логика решений (что показать, когда отменить) — в
 * `download-progress-state.ts`, эта обёртка только исполняет её результат.
 */
function localApkUri(versionCode: number): string {
  return `${FileSystem.cacheDirectory}${cachedApkFileName(versionCode)}`;
}

async function cachedFileNames(): Promise<string[]> {
  if (!FileSystem.cacheDirectory) return [];
  try {
    return await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  } catch {
    return [];
  }
}

async function deleteCachedFiles(predicate: (fileName: string) => boolean): Promise<void> {
  const names = (await cachedFileNames()).filter(predicate);
  await Promise.all(
    names.map((name) =>
      FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${name}`, { idempotent: true }).catch(() => undefined),
    ),
  );
}

/**
 * При запуске: удалить скачанные APK, которые уже поставлены или устарели
 * (`cached-apk.ts: shouldDeleteCachedApk`). Установка перезапускает процесс,
 * так что это единственный момент, когда файл после обновления можно убрать.
 */
export async function cleanUpInstalledApks(installedVersionCode: number | null): Promise<void> {
  await deleteCachedFiles((fileName) => shouldDeleteCachedApk({ fileName, installedVersionCode }));
}

/** Все наши APK в кэше — перед новой закачкой, при отмене и при несовпадении хеша. */
export async function deleteDownloadedApk(): Promise<void> {
  await deleteCachedFiles(isOwnCachedApk);
}

export interface DownloadHandle {
  cancelAsync(): Promise<void>;
}

export interface DownloadCallbacks {
  onProgress(bytesWritten: number, totalBytes: number): void;
  onComplete(localUri: string): void;
  onError(message: string): void;
  onCancelled(): void;
}

/**
 * Начинает закачку в `cacheDirectory`. Возвращает `DownloadHandle` —
 * вызывающий хук (`use-self-update.ts`) хранит его в ref, чтобы кнопка
 * «Отмена» останавливала именно эту закачку, а не создавала новую.
 */
export async function startApkDownload(
  url: string,
  versionCode: number,
  callbacks: DownloadCallbacks,
): Promise<DownloadHandle> {
  // Повторная попытка после обрыва/ошибки не должна дописывать старый битый
  // файл, а файлы прошлых версий занимают по 155 МБ — начинаем с пустого кэша.
  await deleteDownloadedApk();

  let cancelledByUser = false;
  const target = localApkUri(versionCode);
  const resumable = FileSystem.createDownloadResumable(url, target, {}, (data) => {
    callbacks.onProgress(data.totalBytesWritten, data.totalBytesExpectedToWrite);
  });

  resumable
    .downloadAsync()
    .then((result) => {
      if (cancelledByUser) return;
      if (!result) {
        callbacks.onError('Не удалось скачать обновление. Попробуйте ещё раз.');
        return;
      }
      callbacks.onComplete(result.uri);
    })
    .catch(() => {
      if (cancelledByUser) return;
      // Сообщение системы (таймаут, обрыв TCP) обычно английское и
      // техническое — человеку нужен предсказуемый русский текст с понятным
      // следующим шагом, не сырой стек.
      callbacks.onError('Нет связи с сервером. Проверьте интернет и повторите.');
    });

  return {
    async cancelAsync() {
      cancelledByUser = true;
      await resumable.cancelAsync().catch(() => undefined);
      await FileSystem.deleteAsync(target, { idempotent: true });
      callbacks.onCancelled();
    },
  };
}

/** Открытый на чтение файл: размер и чтение куска с позиции. */
interface ApkReader {
  size: number | null;
  read(offset: number, length: number): Promise<Uint8Array> | Uint8Array;
  close(): void;
}

/**
 * Основной путь: `FileHandle` нового API `expo-file-system` — байты сразу
 * `Uint8Array`, без base64, по куску за вызов.
 */
function openWithFileHandle(localUri: string): ApkReader {
  const handle = new File(localUri).open(FileMode.ReadOnly);
  return {
    size: handle.size,
    read(offset, length) {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    close() {
      handle.close();
    },
  };
}

/**
 * Запасной путь, если новый API на прошивке недоступен: старый
 * `readAsStringAsync` с `position`/`length` отдаёт кусок base64-строкой, её
 * раскодирует табличный `decodeBase64ToBytes`. В памяти — тоже один кусок.
 */
async function openWithLegacyReader(localUri: string): Promise<ApkReader> {
  const info = await FileSystem.getInfoAsync(localUri);
  return {
    size: info.exists ? info.size : null,
    async read(offset, length) {
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
        position: offset,
        length,
      });
      return decodeBase64ToBytes(base64);
    },
    close() {},
  };
}

async function openApk(localUri: string): Promise<ApkReader> {
  try {
    return openWithFileHandle(localUri);
  } catch {
    return openWithLegacyReader(localUri);
  }
}

/** Размер скачанного файла на диске, `null` — система не сообщила. */
export async function downloadedApkSize(localUri: string): Promise<number | null> {
  const reader = await openApk(localUri);
  try {
    return reader.size;
  } finally {
    reader.close();
  }
}

export interface HashOptions {
  /** Сколько байт ожидается — из манифеста; нужен, если система не знает размер файла. */
  expectedBytes: number;
  onProgress(bytesHashed: number, totalBytes: number): void;
  isCancelled(): boolean;
}

/**
 * SHA-256 скачанного файла. Основной путь — нативный модуль
 * `VedamatchFileHash` (`MessageDigest`, потоковое чтение буфером 1 МиБ в
 * фоновом потоке): на A51 ожидается 1–3 с на 155 МБ. Запасной — JS-хешер по
 * кускам (`chunked-hash.ts`), ~1 МБ/с на Hermes (раунд 002: ~2,5 мин), когда
 * модуля нет или он упал не из-за отмены. Выбор — `hash-path.ts`.
 * Отмена в обоих путях — `HashCancelledError`.
 */
export async function sha256OfDownloadedApk(localUri: string, options: HashOptions): Promise<string> {
  const path = chooseHashPath({ platformOS: Platform.OS, nativeModuleAvailable: VedamatchFileHash != null });
  if (path === 'native' && VedamatchFileHash) {
    try {
      return await sha256Native(VedamatchFileHash, localUri, options);
    } catch (error) {
      if (nativeHashFailureAction(error) === 'cancelled' || options.isCancelled()) throw new HashCancelledError();
      // Не отмена — считаем тем же файлом через JS: медленно, но проверка не теряется.
    }
  }
  return sha256InJs(localUri, options);
}

type NativeFileHash = NonNullable<typeof VedamatchFileHash>;

let nativeJobCounter = 0;

async function sha256Native(module: NativeFileHash, localUri: string, options: HashOptions): Promise<string> {
  nativeJobCounter += 1;
  const jobId = `apk-${Date.now()}-${nativeJobCounter}`;
  const subscription = module.addListener('progress', (event) => {
    if (event.jobId !== jobId) return;
    const total = event.totalBytes > 0 ? event.totalBytes : options.expectedBytes;
    options.onProgress(event.bytesHashed, total);
  });
  // Флаг отмены живёт в JS — опрашиваем его и передаём модулю.
  const cancelPoll = setInterval(() => {
    if (options.isCancelled()) module.cancel(jobId);
  }, 200);
  try {
    options.onProgress(0, options.expectedBytes);
    return await module.sha256File(localUri, jobId);
  } finally {
    clearInterval(cancelPoll);
    subscription.remove();
  }
}

/** Запасной путь: JS-хешер по кускам в 1 МиБ, в памяти один кусок. */
async function sha256InJs(localUri: string, options: HashOptions): Promise<string> {
  const reader = await openApk(localUri);
  try {
    return await sha256InChunks({
      totalBytes: reader.size ?? options.expectedBytes,
      readChunk: (offset, length) => reader.read(offset, length),
      chunkSize: DEFAULT_HASH_CHUNK_BYTES,
      onProgress: options.onProgress,
      isCancelled: options.isCancelled,
    });
  } finally {
    reader.close();
  }
}

/** `content://` через `FileProvider` — обязателен для установки на Android 8+. */
export async function contentUriOf(localUri: string): Promise<string> {
  return FileSystem.getContentUriAsync(localUri);
}
