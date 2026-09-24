"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Trash2, X } from "lucide-react";
import type { ChatStatusAuthorDto } from "@vedamatch/shared";
import { deleteChatStatus, viewChatStatus } from "@/lib/chat-client";
import { ChatAvatar } from "../chat-avatar";
import {
  firstUnseen,
  statusDurationMs,
  stepStatus,
  type StatusPosition,
} from "./status-playback";

/**
 * Просмотр статусов (VED-129) во весь экран, как в WhatsApp: полоски
 * прогресса сверху, тап справа — дальше, слева — назад, крестик и Escape —
 * закрыть. Статус сам сменяется следующим; ролик — когда доиграл.
 *
 * Открытый чужой статус отмечается просмотренным — его секция в кружке
 * гаснет. У своего видно число просмотров и есть «Удалить».
 */
export function StatusViewer({
  authors,
  startAuthor,
  viewerId,
  onClose,
  onChanged,
}: {
  authors: ChatStatusAuthorDto[];
  startAuthor: number;
  viewerId: string;
  onClose: () => void;
  /** Что-то отметили или удалили — ленте пора перечитать себя. */
  onChanged: () => void;
}) {
  const [at, setAt] = useState<StatusPosition>(() => ({
    author: startAuthor,
    status: authors[startAuthor] ? firstUnseen(authors[startAuthor]) : 0,
  }));
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const seen = useRef(new Set<string>());
  const changed = useRef(false);

  const author = authors[at.author];
  const status = author?.statuses[at.status];
  const own = author?.user.id === viewerId;

  const finish = useCallback(() => {
    if (changed.current) onChanged();
    onClose();
  }, [onChanged, onClose]);

  const step = useCallback(
    (delta: 1 | -1) => {
      const next = stepStatus(authors, at, delta);
      if (next) {
        setAt(next);
        setProgress(0);
      } else if (delta === 1) finish();
    },
    [authors, at, finish],
  );

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Просмотр отмечается один раз на статус и только у чужих.
  useEffect(() => {
    if (!status || own || status.viewed || seen.current.has(status.id)) return;
    seen.current.add(status.id);
    changed.current = true;
    void viewChatStatus(status.id).catch(() => undefined);
  }, [status, own]);

  // Таймер фото и текста. Ролик ведёт себя сам: `timeupdate` и `ended`.
  useEffect(() => {
    if (!status || paused || status.media?.kind === "video") return;
    const total = statusDurationMs(status);
    const started = performance.now() - progress * total;
    const timer = window.setInterval(() => {
      const share = (performance.now() - started) / total;
      if (share >= 1) {
        window.clearInterval(timer);
        step(1);
      } else setProgress(share);
    }, 100);
    return () => window.clearInterval(timer);
    // progress намеренно не в зависимостях: он и есть результат таймера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, paused, step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, step]);

  async function remove() {
    if (!status || !window.confirm("Удалить этот статус?")) return;
    try {
      await deleteChatStatus(status.id);
      changed.current = true;
      finish();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалилось");
    }
  }

  if (!author || !status) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Статусы: ${own ? "мои" : author.user.name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white"
    >
      <div className="flex gap-1 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {author.statuses.map((item, index) => (
          <span
            key={item.id}
            aria-hidden
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
          >
            <span
              className="block h-full bg-white"
              style={{
                width: `${
                  index < at.status
                    ? 100
                    : index === at.status
                      ? Math.round(progress * 100)
                      : 0
                }%`,
              }}
            />
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        <ChatAvatar kind="direct" user={author.user} title={author.user.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {own ? "Мой статус" : author.user.name}
          </p>
          <p className="text-xs text-white/75">
            {new Date(status.createdAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {own && (
          <>
            <span className="flex items-center gap-1 text-xs text-white/85">
              <Eye aria-hidden className="size-4" />
              <span className="sr-only">Просмотров:</span>
              {status.viewCount ?? 0}
            </span>
            <button
              type="button"
              onClick={() => void remove()}
              aria-label="Удалить статус"
              className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
            >
              <Trash2 aria-hidden className="size-5" />
            </button>
          </>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={finish}
          aria-label="Закрыть"
          className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X aria-hidden className="size-6" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {status.media?.kind === "photo" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={status.id}
            src={status.media.url}
            alt={status.text ?? "Фото статуса"}
            className="max-h-full max-w-full object-contain"
          />
        )}
        {status.media?.kind === "video" && (
          <video
            key={status.id}
            src={status.media.url}
            poster={status.media.posterUrl ?? undefined}
            autoPlay
            playsInline
            className="max-h-full max-w-full"
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0)
                setProgress(video.currentTime / video.duration);
            }}
            onEnded={() => step(1)}
          />
        )}
        {!status.media && (
          <p className="max-w-lg whitespace-pre-wrap px-8 text-center font-display text-2xl font-semibold leading-snug">
            {status.text}
          </p>
        )}

        {/* Половины экрана — назад и вперёд, как в WhatsApp. */}
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Предыдущий статус"
          className="absolute inset-y-0 left-0 w-1/3"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Следующий статус"
          className="absolute inset-y-0 right-0 w-2/3"
        />
      </div>

      {status.media && status.text && (
        <p className="whitespace-pre-wrap bg-black/70 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-center text-sm">
          {status.text}
        </p>
      )}
      {error && (
        <p role="alert" className="px-4 pb-4 text-center text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
