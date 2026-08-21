"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryEntryStatus } from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import {
  removeLibraryEntry,
  restoreLibraryEntry,
} from "@/lib/library-admin-api";

/**
 * Снять запись с публикации или вернуть. Отдельно от пользовательского
 * удаления: то доступно автору и стирает запись, а это решение администрации,
 * и его можно отменить.
 */
export function LibraryEntryActions({
  entryId,
  status,
}: {
  entryId: string;
  status: LibraryEntryStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = status === "removed_by_admin";

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      {error && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          void run(() =>
            removed ? restoreLibraryEntry(entryId) : removeLibraryEntry(entryId),
          )
        }
        className={[
          "rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50",
          removed
            ? "border-glass-brd text-text-1 hover:text-text-0"
            : "border-magenta/50 text-text-0 hover:bg-magenta/10",
        ].join(" ")}
      >
        {removed ? "Вернуть в каталог" : "Снять с публикации"}
      </button>
    </div>
  );
}
