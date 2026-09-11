"use client";

import { FormEvent, useRef, useState } from "react";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Столько же принимает сервер: это трактовка, а не статья. */
const MAX_LENGTH = 800;

export interface AddedExplanation {
  text: string;
  author: { id: string; name: string };
}

/**
 * «Добавить пояснение» к афоризму.
 *
 * Подпись «пояснение написал такой-то» и жалоба на трактовку были давно, а
 * написать её мог только администратор, правя текст поста. Кнопки, ради
 * которой всё это заводилось, не было.
 *
 * Пояснение у афоризма одно: второй человек не переписывает чужую трактовку
 * поверх — он с ней спорит жалобой. Поэтому кнопки нет там, где пояснение уже
 * есть, а сервер на всякий случай проверяет это ещё раз.
 */
export function ExplanationDialog({
  postId,
  className,
  onAdded,
}: {
  postId: string;
  className?: string;
  onAdded: (added: AddedExplanation) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/motivation/posts/${postId}/explanation`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        explanation: string;
        explanationAuthor: { id: string; name: string };
      };
      onAdded({ text: result.explanation, author: result.explanationAuthor });
      dialogRef.current?.close();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не отправилось",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={className ?? "underline-offset-4 hover:underline"}
      >
        Добавить пояснение
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="explanation-title"
        className="m-auto w-[min(92vw,30rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
      >
        <form onSubmit={submit} className="p-6 text-left">
          <h2
            id="explanation-title"
            className="font-display text-lg font-bold"
          >
            Ваше пояснение
          </h2>
          <p className="mt-1.5 text-sm text-text-1">
            Как вы понимаете эти слова. Пояснение появится под афоризмом сразу
            и будет подписано вашим именем.
          </p>

          <label className="mt-4 block text-sm text-text-1">
            <span className="sr-only">Текст пояснения</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={6}
              autoFocus
              placeholder="О чём это для вас"
              className="w-full rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-0"
            />
          </label>
          <p className="mt-1 text-right font-mono text-xs text-text-2">
            {text.trim().length} / {MAX_LENGTH}
          </p>

          {error && (
            <p role="alert" className="mt-2 text-sm text-magenta">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={pending || text.trim().length === 0}
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {pending ? "Отправляем…" : "Опубликовать"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Сообщение сервера человеку понятнее, чем «HTTP 400». */
async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? `Не получилось (${response.status})`;
}
