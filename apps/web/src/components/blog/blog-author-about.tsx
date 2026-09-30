"use client";

import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import { BLOG_ABOUT_MAX_LENGTH } from "@vedamatch/shared";
import { BlogApiError, updateBlogAbout } from "@/lib/blog-client-api";

/**
 * «О себе» на личной странице (VED-686). Хозяин страницы пишет и правит
 * текст на месте; гость видит его, а пустой блок чужой страницы не
 * показывается вовсе.
 */
export function BlogAuthorAbout({
  initial,
  mine,
}: {
  initial: string | null;
  mine: boolean;
}) {
  const [about, setAbout] = useState(initial);
  const [draft, setDraft] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const counterId = useId();

  if (!mine && !about) return null;

  async function save() {
    setPending(true);
    setError(null);
    try {
      const result = await updateBlogAbout(draft);
      setAbout(result.about);
      setDraft(result.about ?? "");
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError ? cause.message : "Не удалось сохранить.",
      );
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setDraft(about ?? "");
    setError(null);
    setEditing(false);
  }

  const over = draft.length > BLOG_ABOUT_MAX_LENGTH;

  return (
    <section
      aria-labelledby={`${fieldId}-title`}
      className="mb-6 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={`${fieldId}-title`}
          className="font-display text-sm font-semibold text-text-0"
        >
          О себе
        </h2>
        {mine && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-1 transition-colors hover:bg-bg-2 hover:text-text-0"
          >
            <Pencil aria-hidden className="size-3.5" />
            {about ? "Изменить" : "Написать о себе"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <label htmlFor={fieldId} className="sr-only">
            О себе
          </label>
          <textarea
            id={fieldId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            aria-describedby={counterId}
            placeholder="Кто вы, чем живёте, что хотите рассказать о себе"
            className="w-full resize-y rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-0 placeholder:text-text-2"
          />
          <p
            id={counterId}
            className={`mt-1 text-xs ${over ? "font-semibold text-text-0" : "text-text-1"}`}
          >
            {draft.length} из {BLOG_ABOUT_MAX_LENGTH}
          </p>
          {error && (
            <p role="alert" className="mt-1 text-xs text-text-0">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending || over}
              className="min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
            >
              {pending ? "Сохраняю…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="min-h-11 rounded-lg px-4 py-2 text-sm text-text-1 hover:bg-bg-2"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : about ? (
        <p className="mt-2 whitespace-pre-line text-sm text-text-0">{about}</p>
      ) : (
        <p className="mt-2 text-sm text-text-1">
          Расскажите о себе — это увидят те, кто зайдёт на вашу страницу.
        </p>
      )}
    </section>
  );
}
