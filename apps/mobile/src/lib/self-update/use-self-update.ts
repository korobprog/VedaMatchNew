import Constants from 'expo-constants';
import { useCallback, useMemo, useRef, useState } from 'react';
import { appVariant } from '@/config/app-variant';
import {
  deleteDownloadedApk,
  sha256OfDownloadedApk,
  startApkDownload,
  type DownloadHandle,
} from './apk-downloader';
import { openSystemInstaller } from './apk-installer';
import { readDismissedUntilVersionCode, writeDismissedUntilVersionCode } from './dismissed-version-store';
import {
  IDLE_DOWNLOAD_STATE,
  reduceDownloadState,
  type DownloadState,
} from './download-progress-state';
import type { AppManifest } from './manifest-validation';
import { shouldWarnBeforeDownloadNow } from './network-info';
import { fetchAppManifest } from './self-update-client';
import { verifyDownloadedFile } from './sha256-verify';
import { decideUpdate, type UpdateDecision } from './update-decision';

/**
 * Хук секции «Проверить обновление» (VED-176, вкладка «Сервисы»). Собирает
 * побочные эффекты (сеть, файлы, хранилище) вокруг чистых решений
 * (`update-decision.ts`, `download-progress-state.ts`, `sha256-verify.ts`) —
 * сам не тестируется юнитом (тестируется только на телефоне, см.
 * `gan-harness/generator-state.md`), но каждая ветка его логики — прямой
 * вызов уже протестированной чистой функции.
 */
export type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'checked'; decision: UpdateDecision }
  | { kind: 'check-error' };

function currentVersionCode(): number {
  return (Constants.expoConfig?.android?.versionCode as number | undefined) ?? 1;
}

export function useSelfUpdate() {
  const variant = appVariant();
  const [checkState, setCheckState] = useState<CheckState>({ kind: 'idle' });
  const [downloadState, setDownloadState] = useState<DownloadState>(IDLE_DOWNLOAD_STATE);
  const handleRef = useRef<DownloadHandle | null>(null);
  const manifestRef = useRef<AppManifest | null>(null);

  const dispatch = useCallback((event: Parameters<typeof reduceDownloadState>[1]) => {
    setDownloadState((state) => reduceDownloadState(state, event));
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!variant.selfUpdate) {
      setCheckState({ kind: 'checked', decision: { kind: 'hidden' } });
      return;
    }
    setCheckState({ kind: 'checking' });
    const manifest = await fetchAppManifest();
    if (!manifest) {
      setCheckState({ kind: 'check-error' });
      return;
    }
    manifestRef.current = manifest;
    const dismissedUntilVersionCode = await readDismissedUntilVersionCode();
    const decision = decideUpdate({
      selfUpdate: variant.selfUpdate,
      currentVersionCode: currentVersionCode(),
      manifest,
      dismissedUntilVersionCode,
      now: new Date(),
      manifestFetchedAt: new Date(),
    });
    setCheckState({ kind: 'checked', decision });
  }, [variant.selfUpdate]);

  const beginDownload = useCallback(
    async (manifest: AppManifest) => {
      dispatch({ type: 'start' });
      const metered = await shouldWarnBeforeDownloadNow();
      if (!metered) {
        dispatch({ type: 'network-metered-confirmed' });
        await launchDownload(manifest);
      }
      // На метрируемой сети остаёмся в `confirm-metered` — диалог решает
      // человек кнопками «Продолжить»/«Отмена» (см. ниже).
    },
    [dispatch],
  );

  const launchDownload = useCallback(
    async (manifest: AppManifest) => {
      const handle = await startApkDownload(manifest.url, {
        onProgress: (bytesWritten, totalBytes) => dispatch({ type: 'progress', bytesWritten, totalBytes }),
        onComplete: (localUri) => {
          dispatch({ type: 'download-complete', localUri });
          void verifyAndSettle(localUri, manifest.sha256);
        },
        onError: (message) => dispatch({ type: 'error', message }),
        onCancelled: () => dispatch({ type: 'cancel' }),
      });
      handleRef.current = handle;
    },
    [dispatch],
  );

  const verifyAndSettle = useCallback(
    async (localUri: string, expectedSha256: string) => {
      try {
        const computed = await sha256OfDownloadedApk(localUri);
        if (verifyDownloadedFile(computed, expectedSha256) === 'match') {
          dispatch({ type: 'hash-verified' });
        } else {
          await deleteDownloadedApk();
          dispatch({ type: 'hash-mismatch' });
        }
      } catch {
        await deleteDownloadedApk();
        dispatch({ type: 'hash-mismatch' });
      }
    },
    [dispatch],
  );

  const confirmMeteredDownload = useCallback(async () => {
    dispatch({ type: 'network-metered-confirmed' });
    const manifest = manifestRef.current;
    if (manifest) await launchDownload(manifest);
  }, [dispatch, launchDownload]);

  const cancelDownload = useCallback(async () => {
    if (handleRef.current) {
      await handleRef.current.cancelAsync();
      handleRef.current = null;
    } else {
      // Отмена до старта реальной закачки (мы ещё в confirm-metered).
      dispatch({ type: 'cancel' });
    }
  }, [dispatch]);

  const installNow = useCallback(async () => {
    if (downloadState.phase !== 'ready' || !downloadState.localUri) return;
    dispatch({ type: 'install-started' });
    await openSystemInstaller(downloadState.localUri);
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
      selfUpdate: variant.selfUpdate,
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
      variant.selfUpdate,
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
