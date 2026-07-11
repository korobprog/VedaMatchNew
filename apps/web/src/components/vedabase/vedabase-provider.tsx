"use client";

import type { VedabaseLibraryManifest } from "@vedamatch/shared";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  VedabaseDownloadManager,
  type VedabaseDownloadController,
  type VedabaseDownloadSnapshot,
} from "@/lib/vedabase/download-manager";

const serverSnapshot: VedabaseDownloadSnapshot = {
  downloads: {},
  libraryDownload: null,
};

interface VedabaseContextValue {
  library: VedabaseLibraryManifest;
  snapshot: VedabaseDownloadSnapshot;
  actionError: string | null;
  downloadBook(bookSlug: string): void;
  resumeBook(bookSlug: string): void;
  pauseBook(bookSlug: string): void;
  removeBook(bookSlug: string): void;
  downloadLibrary(): void;
}

const VedabaseContext = createContext<VedabaseContextValue | null>(null);

export function VedabaseProvider({
  userId,
  library,
  manager: providedManager,
  children,
}: {
  userId: string;
  library: VedabaseLibraryManifest;
  manager?: VedabaseDownloadController;
  children: ReactNode;
}) {
  const manager = useMemo(
    () => providedManager ?? new VedabaseDownloadManager(userId),
    [providedManager, userId],
  );
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    () => serverSnapshot,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void manager.initialize().catch((error: unknown) => {
      setActionError(errorMessage(error));
    });
  }, [manager]);

  const run = (operation: Promise<void>) => {
    setActionError(null);
    void operation.catch((error: unknown) => setActionError(errorMessage(error)));
  };
  const value: VedabaseContextValue = {
    library,
    snapshot,
    actionError,
    downloadBook: (bookSlug) => run(manager.downloadBook(bookSlug)),
    resumeBook: (bookSlug) => run(manager.resumeBook(bookSlug)),
    pauseBook: (bookSlug) => manager.pauseBook(bookSlug),
    removeBook: (bookSlug) => run(manager.removeBook(bookSlug)),
    downloadLibrary: () => run(manager.downloadLibrary(library)),
  };

  return (
    <VedabaseContext.Provider value={value}>
      {children}
    </VedabaseContext.Provider>
  );
}

export function useVedabase(): VedabaseContextValue {
  const context = useContext(VedabaseContext);
  if (!context) {
    throw new Error("useVedabase must be used inside VedabaseProvider");
  }
  return context;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить действие";
}
