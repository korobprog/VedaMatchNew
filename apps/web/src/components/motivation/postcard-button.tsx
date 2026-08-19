"use client";

import { useState } from "react";
import type { MotivationEventDto, MotivationPostcardResult } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Сделать открытку»: тот же кадр с поздравлением сверху. Показывается только
 * когда есть повод — событие из справочника админки; без повода кнопки нет,
 * чтобы человек не искал, что написать.
 */
export function PostcardButton({
  postId,
  event,
  existingUrl,
  className,
}: {
  postId: string;
  event: MotivationEventDto | null;
  existingUrl?: string | null;
  className?: string;
}) {
  const [url, setUrl] = useState(existingUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event && !url) return null;

  async function build() {
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_URL}/motivation/posts/${postId}/postcard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as MotivationPostcardResult;
      setUrl(result.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не получилось");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={className ?? "inline-flex flex-wrap items-center gap-2"}>
      {url ? (
        <a
          href={url}
          download
          className="btn-mint-outline rounded-xl px-4 py-2 text-sm font-medium"
        >
          ⤓ Скачать открытку
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void build()}
          disabled={pending}
          className="btn-mint-outline rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Собираем…" : `🎁 Сделать открытку${event ? ` · ${event.title}` : ""}`}
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-red-500">
          {error}
        </span>
      )}
    </span>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    return message || `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
}
