"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { updateMusicArtist } from "@/lib/music-admin-client-api";

/** Столько же принимает сервер (`MAX_BIO_LENGTH`). */
const BIO_MAX = 2000;

/**
 * «Биография» исполнителя (VED-661) — кнопкой в строке «Записи», на месте
 * «Перемешать»: текст раскрывается полем под строкой. Редакция Музыки там же
 * его и пишет; остальным кнопка видна, только когда биография есть.
 */
export function MusicArtistBioButton({
  artistId,
  bio,
  canEdit,
}: {
  artistId: string;
  bio: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(bio ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bio && !canEdit) return null;

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateMusicArtist(artistId, { bio: draft.trim() || null });
      router.refresh();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
          open
            ? "border-cyan bg-cyan/10 text-text-0"
            : "border-glass-brd text-text-1 hover:text-text-0"
        }`}
      >
        <BookOpen aria-hidden className="size-4" />
        Биография
      </button>
      {open && (
        <div
          id={panelId}
          className="glass order-last basis-full rounded-2xl border border-glass-brd p-4"
        >
          {canEdit ? (
            <label className="block">
              <span className="mb-1 block text-xs text-text-2">
                Биография исполнителя
              </span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={BIO_MAX}
                rows={6}
                className="w-full rounded-lg border border-glass-brd bg-bg-1 p-2.5 text-sm text-text-0"
              />
              <span className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={pending || draft.trim() === (bio ?? "").trim()}
                  className="rounded-lg bg-magenta px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Сохраняем…" : "Сохранить"}
                </button>
                {error && (
                  <span role="alert" className="text-xs text-magenta">
                    {error}
                  </span>
                )}
              </span>
            </label>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-1">
              {bio}
            </p>
          )}
        </div>
      )}
    </>
  );
}
