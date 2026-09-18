import { File, FileMode } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { decodeBase64ToBytes } from './binary-utils';
import { DEFAULT_HASH_CHUNK_BYTES, sha256InChunks } from './chunked-hash';

/**
 * Скачивание и хеширование APK на диск (VED-176) — сетевой и файловый слой,
 * тестируется только на телефоне (`spec.md`, «Что проверяется только на
 * телефоне»): реальный `FileProvider`/`content://` эмуляция jest-expo не
 * покрывает. Логика решений (что показать, когда отменить) — в
 * `download-progress-state.ts`, эта обёртка только исполняет её результат.
 */
const APK_FILE_NAME = 'vedamatch-update.apk';

function localApkUri(): string {
  return `${FileSystem.cacheDirectory}${APK_FILE_NAME}`;
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
export async function startApkDownload(url: string, callbacks: DownloadCallbacks): Promise<DownloadHandle> {
  // Повторная попытка после обрыва/ошибки не должна дописывать старый битый
  // файл — начинаем с нуля.
  await FileSystem.deleteAsync(localApkUri(), { idempotent: true });

  let cancelledByUser = false;
  const resumable = FileSystem.createDownloadResumable(url, localApkUri(), {}, (data) => {
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
      await FileSystem.deleteAsync(localApkUri(), { idempotent: true });
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
 * SHA-256 скачанного файла по кускам в 1 МиБ (`chunked-hash.ts`): в памяти
 * одновременно только текущий кусок, между кусками поток отдаётся
 * интерфейсу (прогресс «Проверяем файл… N %», кнопка «Отмена»). Итерация 1
 * читала весь APK одной base64-строкой (~217 МБ) и декодировала её
 * синхронно — сотни мегабайт и секунды замершего интерфейса.
 */
export async function sha256OfDownloadedApk(localUri: string, options: HashOptions): Promise<string> {
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

export async function deleteDownloadedApk(): Promise<void> {
  await FileSystem.deleteAsync(localApkUri(), { idempotent: true });
}

/** `content://` через `FileProvider` — обязателен для установки на Android 8+. */
export async function contentUriOf(localUri: string): Promise<string> {
  return FileSystem.getContentUriAsync(localUri);
}
