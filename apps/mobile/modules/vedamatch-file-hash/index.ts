import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * JS-обёртка нативного модуля `VedamatchFileHash` (Kotlin,
 * `android/src/main/java/com/vedamatch/filehash`): потоковый SHA-256 файла
 * через `java.security.MessageDigest` в фоновом потоке (VED-176, итерация 3).
 * Только Android — на iOS/вебе и в сборке без модуля здесь `null`, и
 * `apk-downloader.ts` берёт запасной JS-хешер (`chunked-hash.ts`); выбор —
 * чистая `chooseHashPath` (`src/lib/self-update/hash-path.ts`).
 */

export type FileHashEvents = {
  /** Не чаще раза на 4 МиБ и в самом конце. `totalBytes` = -1, если размер неизвестен. */
  progress(payload: { jobId: string; bytesHashed: number; totalBytes: number }): void;
};

declare class VedamatchFileHashNativeModule extends NativeModule<FileHashEvents> {
  /** SHA-256 файла (`file://` или `content://`) → hex в нижнем регистре.
   *  Отмена — reject с кодом `ERR_HASH_CANCELLED`. */
  sha256File(uri: string, jobId: string): Promise<string>;
  cancel(jobId: string): void;
}

const VedamatchFileHash = requireOptionalNativeModule<VedamatchFileHashNativeModule>('VedamatchFileHash');

export default VedamatchFileHash;
