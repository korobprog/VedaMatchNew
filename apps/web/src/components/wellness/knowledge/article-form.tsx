"use client";

import { useEffect, useId, useState } from "react";
import type { WellnessArticleDetail } from "@vedamatch/shared";
import {
  createWellnessArticle,
  deleteWellnessArticleCover,
  updateWellnessArticle,
  uploadWellnessArticleCover,
} from "@/lib/wellness-api";
import { coverFileProblem } from "./knowledge-text";

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Статья «Знаний»: новая в рубрике `categoryId` или правка `article`.
 * Обложка уходит отдельным запросом после сохранения текста: так у статьи
 * уже есть id, под которым лежит объект в хранилище.
 */
export function ArticleForm({
  categoryId,
  article,
  onDone,
  onCancel,
}: {
  categoryId: string;
  article?: WellnessArticleDetail;
  onDone: (saved: WellnessArticleDetail) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [published, setPublished] = useState(
    article ? article.status === "published" : false,
  );
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropCover, setDropCover] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Адрес превью освобождается, как только его сменили или форма закрылась.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const pickCover = (file: File | null) => {
    setCover(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const shownCover =
    preview ?? (dropCover ? null : (article?.coverUrl ?? null));

  const save = async () => {
    const input = {
      categoryId,
      title,
      body,
      status: published ? ("published" as const) : ("draft" as const),
    };
    // Статья, созданная в прошлую попытку, правится, а не заводится заново:
    // иначе сбой загрузки обложки оставит дубль.
    const existingId = article?.id ?? createdId;
    let saved = existingId
      ? await updateWellnessArticle(existingId, input)
      : await createWellnessArticle(input);
    if (!existingId) setCreatedId(saved.id);
    if (cover) {
      saved = await uploadWellnessArticleCover(saved.id, cover);
    } else if (dropCover && saved.coverUrl) {
      saved = await deleteWellnessArticleCover(saved.id);
    }
    return saved;
  };

  return (
    <form
      className="rounded-2xl border border-glass-brd bg-glass p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        save()
          .then(onDone)
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-display text-lg font-bold text-text-0">
        {article ? "Править статью" : "Новая статья"}
      </p>

      <label htmlFor={`${id}-title`} className="mt-3 block text-sm text-text-0">
        Заголовок
      </label>
      <input
        id={`${id}-title`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        required
        className={field}
      />

      <label htmlFor={`${id}-cover`} className="mt-3 block text-sm text-text-0">
        Обложка{" "}
        <span className="text-text-2">(JPEG, PNG или WebP до 10 МБ)</span>
      </label>
      {shownCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shownCover}
          alt=""
          className="mt-1 h-40 w-full rounded-xl object-cover"
        />
      )}
      <input
        id={`${id}-cover`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const problem = file ? coverFileProblem(file) : null;
          setError(problem);
          pickCover(problem ? null : file);
          if (file && !problem) setDropCover(false);
        }}
        className="mt-1 block w-full text-sm text-text-1"
      />
      {(cover || (article?.coverUrl && !dropCover)) && (
        <button
          type="button"
          onClick={() => {
            pickCover(null);
            setDropCover(true);
          }}
          className="mt-2 text-sm text-text-1 underline underline-offset-2"
        >
          Убрать обложку
        </button>
      )}

      <label htmlFor={`${id}-body`} className="mt-3 block text-sm text-text-0">
        Текст
      </label>
      <p id={`${id}-body-hint`} className="text-xs text-text-2">
        Абзацы — через пустую строку. Можно «# Заголовок», «- пункт списка»,
        «**жирный**» и ссылки вида [текст](https://…).
      </p>
      <textarea
        id={`${id}-body`}
        aria-describedby={`${id}-body-hint`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={14}
        required
        className={field}
      />

      <label className="mt-3 flex items-center gap-2 text-sm text-text-0">
        <input
          type="checkbox"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        Опубликовать — без галочки статья остаётся черновиком и видна только
        администраторам
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
        >
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
