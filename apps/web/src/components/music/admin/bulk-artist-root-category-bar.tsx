"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MusicCategoryDto } from "@vedamatch/shared";
import { setMusicArtistsRootCategory } from "@/lib/music-admin-client-api";
import { plural } from "@/lib/plural";
import { Alert } from "@/components/ui/alert";

const artistsWord = (n: number) =>
  plural(n, "исполнитель", "исполнителя", "исполнителей");

/**
 * Панель массовой простановки корневой категории исполнителям (VED-165-2).
 * Появляется над списком, когда выбран хотя бы один — тем же приёмом, что и
 * массовая смена исполнителя у записей (`MusicBulkArtistBar`).
 *
 * Раньше корневую ставили записи (VED-165), но тестировщик прямо попросил
 * относить к категории исполнителя целиком, «чтобы не возиться с треками» —
 * так редакция размечает исполнителя один раз, а не каждую его новую запись
 * отдельно.
 */
export function MusicBulkArtistRootCategoryBar({
  selectedIds,
  categories,
  onClear,
}: {
  selectedIds: string[];
  categories: MusicCategoryDto[];
  onClear: () => void;
}) {
  const router = useRouter();
  const roots = categories.filter((category) => category.kind === "root");
  const [rootId, setRootId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const count = selectedIds.length;

  async function apply(nextRootId: string) {
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const result = await setMusicArtistsRootCategory({
        artistIds: selectedIds,
        rootCategoryId: nextRootId || null,
      });
      const what = `${result.updated} ${artistsWord(result.updated)}`;
      const rootTitle = roots.find((root) => root.id === nextRootId)?.title;
      setDone(
        rootTitle
          ? `${what} — корневая теперь «${rootTitle}».`
          : `${what} — корневая снята.`,
      );
      setRootId("");
      onClear();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  // Ни одной корневой категории в справочнике — панели нечего предлагать.
  if (roots.length === 0) return null;

  if (count === 0) {
    return done ? (
      <div className="mb-3">
        <Alert tone="success">{done}</Alert>
      </div>
    ) : null;
  }

  return (
    <div
      role="region"
      aria-label="Корневая категория выбранных исполнителей"
      className="mb-3 rounded-xl border border-glass-brd bg-bg-1/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-text-0">
          Выбрано: {count} {artistsWord(count)}
        </span>
        <label className="flex items-center gap-2">
          <span className="sr-only">
            Корневая категория для выбранных исполнителей
          </span>
          <select
            value={rootId}
            onChange={(event) => setRootId(event.target.value)}
            disabled={pending}
            className="h-9 rounded-lg border border-glass-brd bg-bg-1 px-2.5 text-sm text-text-0 disabled:opacity-50"
          >
            <option value="">Снять корневую</option>
            {roots.map((root) => (
              <option key={root.id} value={root.id}>
                {root.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => void apply(rootId)}
          className="h-9 rounded-lg border border-cyan/50 px-3 text-sm font-semibold text-text-0 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Применить"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            onClear();
          }}
          className="h-9 rounded-lg px-2 text-sm text-text-2 hover:text-text-0"
        >
          Снять выбор
        </button>
      </div>

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
