"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  CHAT_STATUS_IMAGE_MIME_TYPES,
  CHAT_STATUS_TEXT_MAX,
  CHAT_STATUS_VIDEO_MIME_TYPES,
} from "@vedamatch/shared";
import { createChatStatus } from "@/lib/chat-client";

const ACCEPT = [
  ...CHAT_STATUS_IMAGE_MIME_TYPES,
  ...CHAT_STATUS_VIDEO_MIME_TYPES,
].join(",");

/**
 * Новый статус (VED-129): текст, фото или видео, или текст с тем и другим.
 * Пределы проверяет сервер — он же снимает длительность ролика; здесь
 * только то, что видно сразу: пустой статус не отправить.
 */
export function StatusComposer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  // Адрес превью живёт, пока выбран файл: сменили или убрали — отпускаем.
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function publish() {
    if (pending || (!text.trim() && !file)) return;
    setPending(true);
    setError(null);
    try {
      await createChatStatus({ text, file });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setPending(false);
    }
  }

  const isVideo = file?.type.startsWith("video/");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Новый статус"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-bg-1 p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-text-0">
            Новый статус
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-full text-text-2 hover:text-text-0"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <textarea
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={CHAT_STATUS_TEXT_MAX}
          rows={3}
          placeholder="Что у вас нового? Статус виден всем сутки"
          aria-label="Текст статуса"
          className="block w-full resize-none rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
        />

        {preview && (
          <div className="relative mt-3">
            {isVideo ? (
              <video
                src={preview}
                controls
                className="max-h-64 w-full rounded-xl bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Выбранное фото"
                className="max-h-64 w-full rounded-xl object-contain"
              />
            )}
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Убрать файл"
              className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-bg-0/85 text-text-0"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-glass-brd px-3 text-sm text-text-1 hover:text-text-0">
            <ImagePlus aria-hidden className="size-4" />
            Фото или видео
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <span className="ml-auto text-xs text-text-2">
            {text.length}/{CHAT_STATUS_TEXT_MAX}
          </span>
        </div>
        <p className="mt-2 text-xs text-text-2">
          Видео — до минуты и 50 МБ, фото — до 10 МБ.
        </p>

        {error && (
          <p role="alert" className="mt-2 text-sm text-magenta">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void publish()}
          disabled={pending || (!text.trim() && !file)}
          className="btn-mint mt-3 min-h-11 w-full rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Публикуем…" : "Опубликовать"}
        </button>
      </div>
    </div>
  );
}
