import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { bytesToHex, decodeBase64ToBytes } from './binary-utils';

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

/**
 * SHA-256 скачанного файла. `expo-crypto` не даёт потокового/инкрементального
 * дайджеста — файл читается в память целиком как base64 и хешируется одним
 * вызовом `Crypto.digest`. Приемлемо для канала `site` (релизный APK — по
 * ощутимо меньше, чем debug-сборки со звонками из README, десятки, не сотни
 * МБ) — если реальный релизный файл вырастет за ~150-200 МБ, эту функцию
 * нужно будет заменить на потоковое хеширование по чанкам (сейчас expo-crypto
 * такого API не даёт вовсе).
 */
export async function sha256OfDownloadedApk(localUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = decodeBase64ToBytes(base64);
  // `Uint8Array` из чистого декодера типизирован по общему `ArrayBufferLike`
  // (совместим и с `SharedArrayBuffer`), а `Crypto.digest` в типах expo-crypto
  // требует именно `ArrayBuffer` — на деле здесь всегда обычный буфер,
  // приведение типа безопасно.
  const digestBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
  return bytesToHex(digestBuffer);
}

export async function deleteDownloadedApk(): Promise<void> {
  await FileSystem.deleteAsync(localApkUri(), { idempotent: true });
}

/** `content://` через `FileProvider` — обязателен для установки на Android 8+. */
export async function contentUriOf(localUri: string): Promise<string> {
  return FileSystem.getContentUriAsync(localUri);
}
