"use client";

import { useState } from "react";
import { fetchTrackDownloadUrl } from "@/lib/music-playback-api";

/**
 * «Скачать файл» — запись себе на компьютер или телефон (VED-107).
 *
 * Не то же, что «Сохранить на устройство»: та копия живёт внутри портала и
 * играет без сети, но наружу не выходит. Этот файл человек уносит с собой —
 * в другой плеер, на флешку в машину.
 *
 * Ссылка берётся запросом, а не стоит в `href`: подпись живёт шесть часов,
 * и адрес, отрисованный в страницу утром, к вечеру вёл бы в отказ. Переход на
 * бакет со страницы не уводит — ответ помечен как вложение, и браузер его
 * сохраняет.
 */
export function MusicDownloadButton({ trackId }: { trackId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const { url } = await fetchTrackDownloadUrl(trackId);
      window.location.assign(url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось скачать запись",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => void download()}
        className="flex h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 text-violet"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 11v6" />
          <path d="M9.5 14.5L12 17l2.5-2.5" />
        </svg>
        {pending ? "Готовим файл…" : "Скачать файл"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
