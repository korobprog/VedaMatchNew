"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { registerVedabaseServiceWorker } from "@/lib/vedabase/register-service-worker";
import {
  VedabaseSyncEngine,
  type VedabaseSyncSnapshot,
} from "@/lib/vedabase/sync-engine";

const serverSnapshot: VedabaseSyncSnapshot = {
  state: "local",
  pendingCount: 0,
  error: null,
};

const labels = {
  local: "Локальные данные",
  pending: "Ожидает синхронизации",
  synced: "Синхронизировано",
  error: "Ошибка синхронизации",
} as const;

export function SyncStatus({
  userId,
  engine: providedEngine,
}: {
  userId: string;
  engine?: VedabaseSyncEngine;
}) {
  const engine = useMemo(
    () => providedEngine ?? new VedabaseSyncEngine(userId),
    [providedEngine, userId],
  );
  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    () => serverSnapshot,
  );

  useEffect(() => {
    void registerVedabaseServiceWorker(userId);
    void engine.start();
    return () => {
      if (!providedEngine) engine.dispose();
    };
  }, [engine, providedEngine, userId]);

  return (
    <span
      role="status"
      title={snapshot.error ?? undefined}
      className="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${statusColor(snapshot.state)}`}
      />
      {labels[snapshot.state]}
      {snapshot.pendingCount > 0 ? ` (${snapshot.pendingCount})` : ""}
    </span>
  );
}

function statusColor(state: VedabaseSyncSnapshot["state"]): string {
  if (state === "synced") return "bg-emerald-500";
  if (state === "pending") return "bg-amber-500";
  if (state === "error") return "bg-red-500";
  return "bg-zinc-400";
}
