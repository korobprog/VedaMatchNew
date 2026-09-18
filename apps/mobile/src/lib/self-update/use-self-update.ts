import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appVariant } from '@/config/app-variant';
import {
  cleanUpInstalledApks,
  deleteDownloadedApk,
  downloadedApkSize,
  sha256OfDownloadedApk,
  startApkDownload,
  type DownloadHandle,
} from './apk-downloader';
import { openSystemInstaller } from './apk-installer';
import { HashCancelledError } from './chunked-hash';
import type { CheckFailureKind } from './check-messages';
import { readDismissedUntilVersionCode, writeDismissedUntilVersionCode } from './dismissed-version-store';
import {
  IDLE_DOWNLOAD_STATE,
  reduceDownloadState,
  type DownloadEvent,
  type DownloadState,
} from './download-progress-state';
import type { AppManifest } from './manifest-validation';
import { shouldWarnBeforeDownloadNow } from './network-info';
import { fetchAppManifest } from './self-update-client';
import { verifyDownloadedFile, verifyDownloadedSize } from './sha256-verify';
import { autoCheckReveals, decideUpdate, type UpdateDecision } from './update-decision';
import { parseInstalledVersionCode } from './version-compare';

/**
 * Хук секции «Проверить обновление» (VED-176, вкладка «Сервисы»). Собирает
 * побочные эффекты (сеть, файлы, хранилище) вокруг чистых решений
 * (`self-update-client.ts`, `update-decision.ts`, `download-progress-state.ts`,
 * `chunked-hash.ts`, `sha256-verify.ts`) — сам не тестируется юнитом
 * (проверяется на телефоне), но каждая ветка его логики — вызов уже
 * протестированной чистой функции.
 */
export type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'checked'; decision: UpdateDecision }
  | { kind: 'check-error'; reason: CheckFailureKind };

/**
 * Тихая проверка при открытии вкладки — одна на запуск приложения: вкладка
 * «Сервисы» может монтироваться заново, сеть на каждое открытие не нужна.
 */
let autoCheckDoneThisLaunch = false;

export function useSelfUpdate() {
  const variant = appVariant();
  const { selfUpdate } = variant;
  const [checkState, setCheckState] = useState<CheckState>({ kind: 'idle' });
  const [downloadState, setDownloadState] = useState<DownloadState>(IDLE_DOWNLOAD_STATE);
  const handleRef = useRef<DownloadHandle | null>(null);
  const manifestRef = useRef<AppManifest | null>(null);
  /** Флаг отмены текущей проверки файла — читается между кусками хеширования. */
  const hashCancelRef = useRef<{ cancelled: boolean } | null>(null);
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const phaseRef = useRef(downloadState.phase);
  phaseRef.current = downloadState.phase;

  const dispatch = useCallback((event: DownloadEvent) => {
    setDownloadState((state) => reduceDownloadState(state, event));
  }, []);

  /**
   * `manual` — нажатие «Проверить обновление»/«Проверить ещё раз»: показывает
   * любой исход и снимает «Не сейчас». Тихая проверка (`manual: false`)
   * меняет экран, только если есть доступное и не отклонённое обновление.
   */
  const runCheck = useCallback(async (manual: boolean) => {
    const current = variantRef.current;
    if (!current.selfUpdate) {
      if (manual) setCheckState({ kind: 'checked', decision: { kind: 'hidden' } });
      return;
    }
    const currentVersionCode = parseInstalledVersionCode(Constants.expoConfig?.android?.versionCode);
    if (currentVersionCode == null) {
      if (manual) setCheckState({ kind: 'check-error', reason: 'version-unknown' });
      return;
    }
    if (manual) {
      // Прошлая попытка закончилась ошибкой или отменой — новая проверка
      // начинает с чистой карточки (активную закачку reset не трогает).
      dispatch({ type: 'reset' });
      setCheckState({ kind: 'checking' });
    }

    const result = await fetchAppManifest(current);
    if (result.kind !== 'ok') {
      if (manual) setCheckState({ kind: 'check-error', reason: result.kind });
      return;
    }
    const dismissedUntilVersionCode = manual ? null : await readDismissedUntilVersionCode();
    const decision = decideUpdate({
      selfUpdate: current.selfUpdate,
      currentVersionCode,
      manifest: result.manifest,
      dismissedUntilVersionCode,
      manual,
      now: new Date(),
      manifestFetchedAt: new Date(),
    });
    if (!manual && !autoCheckReveals(decision)) return;
    manifestRef.current = result.manifest;
    setCheckState({ kind: 'checked', decision });
  }, [dispatch]);

  const checkForUpdate = useCallback(() => runCheck(true), [runCheck]);

  useEffect(() => {
    if (autoCheckDoneThisLaunch || !selfUpdate) return;
    autoCheckDoneThisLaunch = true;
    // Скачанный APK, который уже установлен (или устарел), — убрать из кэша:
    // установка перезапускает процесс, раньше этого момента удалить некому.
    cleanUpInstalledApks(parseInstalledVersionCode(Constants.expoConfig?.android?.versionCode)).catch(
      () => undefined,
    );
    // Ошибки тихой проверки не показываются: человек ничего не нажимал.
    runCheck(false).catch(() => undefined);
  }, [runCheck, selfUpdate]);

  const verifyAndSettle = useCallback(
    async (localUri: string, manifest: AppManifest) => {
      const token = { cancelled: false };
      hashCancelRef.current = token;
      try {
        const size = await downloadedApkSize(localUri);
        if (verifyDownloadedSize(size, manifest.sizeBytes) === 'mismatch') {
          await deleteDownloadedApk();
          dispatch({ type: 'hash-mismatch' });
          return;
        }
        const computed = await sha256OfDownloadedApk(localUri, {
          expectedBytes: manifest.sizeBytes,
          onProgress: (bytesVerified) => dispatch({ type: 'verify-progress', bytesVerified }),
          isCancelled: () => token.cancelled,
        });
        if (verifyDownloadedFile(computed, manifest.sha256) === 'match') {
          dispatch({ type: 'hash-verified' });
        } else {
          await deleteDownloadedApk();
          dispatch({ type: 'hash-mismatch' });
        }
      } catch (error) {
        // Отмену уже обработал `cancelDownload` (файл удалён, фаза cancelled).
        if (error instanceof HashCancelledError || token.cancelled) return;
        await deleteDownloadedApk();
        dispatch({ type: 'hash-mismatch' });
      } finally {
        if (hashCancelRef.current === token) hashCancelRef.current = null;
      }
    },
    [dispatch],
  );

  const launchDownload = useCallback(
    async (manifest: AppManifest) => {
      // Закачка может закончиться (или упасть) раньше, чем вернётся хэндл, —
      // тогда хранить его незачем.
      let settled = false;
      const handle = await startApkDownload(manifest.url, manifest.versionCode, {
        onProgress: (bytesWritten, totalBytes) => dispatch({ type: 'progress', bytesWritten, totalBytes }),
        onComplete: (localUri) => {
          // Закачка закончилась — её хэндл больше не нужен; отмену фазы
          // проверки ведёт `hashCancelRef`.
          settled = true;
          handleRef.current = null;
          dispatch({ type: 'download-complete', localUri });
          void verifyAndSettle(localUri, manifest);
        },
        onError: (message) => {
          settled = true;
          handleRef.current = null;
          dispatch({ type: 'error', message });
        },
        onCancelled: () => dispatch({ type: 'cancel' }),
      });
      if (!settled) handleRef.current = handle;
    },
    [dispatch, verifyAndSettle],
  );

  const beginDownload = useCallback(
    async (manifest: AppManifest) => {
      manifestRef.current = manifest;
      dispatch({ type: 'start' });
      const metered = await shouldWarnBeforeDownloadNow();
      if (!metered) {
        dispatch({ type: 'network-metered-confirmed' });
        await launchDownload(manifest);
      }
      // На метрируемой сети остаёмся в `confirm-metered` — решает человек
      // кнопками «Продолжить»/«Отмена».
    },
    [dispatch, launchDownload],
  );

  const confirmMeteredDownload = useCallback(async () => {
    dispatch({ type: 'network-metered-confirmed' });
    const manifest = manifestRef.current;
    if (manifest) await launchDownload(manifest);
  }, [dispatch, launchDownload]);

  const cancelDownload = useCallback(async () => {
    if (hashCancelRef.current) {
      // Идёт проверка файла: цикл хеширования остановится на следующем куске.
      hashCancelRef.current.cancelled = true;
      hashCancelRef.current = null;
      dispatch({ type: 'cancel' });
      await deleteDownloadedApk();
      return;
    }
    const handle = handleRef.current;
    handleRef.current = null;
    if (handle) {
      await handle.cancelAsync();
      return;
    }
    // Отмена до старта закачки (confirm-metered) или файла, готового к установке.
    const phase = phaseRef.current;
    dispatch({ type: 'cancel' });
    if (phase === 'ready') await deleteDownloadedApk();
  }, [dispatch]);

  const installNow = useCallback(async () => {
    if (downloadState.phase !== 'ready' || !downloadState.localUri) return;
    dispatch({ type: 'install-started' });
    try {
      await openSystemInstaller(downloadState.localUri);
      // Успешная установка перезапускает процесс — сюда доходим, только если
      // установщик закрыли без установки.
      dispatch({ type: 'install-returned' });
    } catch {
      dispatch({ type: 'error', message: 'Не удалось открыть системный установщик. Попробуйте ещё раз.' });
    }
  }, [dispatch, downloadState.localUri, downloadState.phase]);

  const dismiss = useCallback(async (manifest: AppManifest) => {
    await writeDismissedUntilVersionCode(manifest.versionCode);
    setCheckState({ kind: 'checked', decision: { kind: 'dismissed', manifest } });
  }, []);

  const retryDownload = useCallback(async () => {
    const manifest = manifestRef.current;
    if (manifest) await beginDownload(manifest);
  }, [beginDownload]);

  return useMemo(
    () => ({
      selfUpdate,
      checkState,
      downloadState,
      checkForUpdate,
      beginDownload,
      confirmMeteredDownload,
      cancelDownload,
      installNow,
      dismiss,
      retryDownload,
    }),
    [
      selfUpdate,
      checkState,
      downloadState,
      checkForUpdate,
      beginDownload,
      confirmMeteredDownload,
      cancelDownload,
      installNow,
      dismiss,
      retryDownload,
    ],
  );
}
