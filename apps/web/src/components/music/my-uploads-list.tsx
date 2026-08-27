"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MusicTrackStatus, MyMusicUploadDto } from "@vedamatch/shared";
import { deleteMyMusicTrack } from "@/lib/music-client-api";
import { formatBytes, formatTrackDuration } from "@/lib/music-duration";
import { Alert } from "@/components/ui/alert";

/**
 * Статусы словами. `pending` пишем «ждёт разбора», а не «на модерации»:
 * второе звучит как подозрение, хотя через очередь проходит каждая запись,
 * включая залитые редакцией.
 */
const STATUS: Record<MusicTrackStatus, { label: string; tone: string }> = {
  draft: { label: "Черновик", tone: "border-glass-brd text-text-2" },
  pending: { label: "Ждёт разбора", tone: "border-gold/40 text-gold" },
  published: { label: "В каталоге", tone: "border-cyan/40 text-cyan" },
  rejected: { label: "Отклонена", tone: "border-magenta/50 text-magenta" },
  hidden: { label: "Снята с витрины", tone: "border-magenta/50 text-magenta" },
};

export function MyMusicUploadsList({ items }: { items: MyMusicUploadDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(trackId: string) {
    setBusy(trackId);
    setError(null);
    try {
      await deleteMyMusicTrack(trackId);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось снять");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        Вы пока ничего не загружали. Записи проходят разбор редакции, и до него
        их слышите только вы.
      </p>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <ul className="space-y-3">
        {items.map((item) => {
          const status = STATUS[item.status];
          return (
            <li
              key={item.trackId}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2 py-0.5 ${status.tone}`}>
                  {status.label}
                </span>
                <span className="text-text-2">
                  {formatTrackDuration(item.durationSeconds)} ·{" "}
                  {formatBytes(item.sizeBytes)}
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-text-0">
                {item.status === "published" ? (
                  <Link
                    href={`/music/tracks/${item.trackId}`}
                    className="hover:text-cyan"
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </p>

              {item.moderationNote && (
                <p className="mt-2 rounded-xl border border-glass-brd bg-glass p-2.5 text-sm text-text-1">
                  <span className="text-text-2">Редакция: </span>
                  {item.moderationNote}
                </p>
              )}

              {item.canDelete && (
                <button
                  type="button"
                  disabled={busy === item.trackId}
                  onClick={() => void remove(item.trackId)}
                  className="mt-3 h-8 rounded-lg border border-glass-brd px-3 text-xs font-semibold text-text-1 hover:text-text-0 disabled:opacity-50"
                >
                  {busy === item.trackId ? "Снимаем…" : "Снять и освободить место"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
