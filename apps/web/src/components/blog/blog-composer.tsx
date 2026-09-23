"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  BLOG_IMAGE_MIME_TYPES,
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_TITLE_MAX_LENGTH,
  type BlogPostDto,
} from "@vedamatch/shared";
import {
  BlogApiError,
  blogErrorText,
  createBlogPost,
} from "@/lib/blog-client-api";
import { BlogBlankLinesTool } from "./blog-blank-lines-tool";
import { BlogTextCounter } from "./blog-text-counter";
import { blogTextLimitState } from "./blog-text-limit";

/**
 * Форма нового поста (VED-238, VED-116).
 *
 * Пост и картинки уезжают одним запросом. Отдельный шаг «дослать файлы»
 * оставлял бы в общей ленте пустую карточку при каждой оборванной загрузке,
 * а пустая карточка на главной хуже, чем её отсутствие.
 */
export function BlogComposer({
  onPublished,
}: {
  onPublished?: (post: BlogPostDto) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const limit = blogTextLimitState(text);

  function pick(list: FileList | null) {
    if (!list) return;
    setFiles((current) =>
      [...current, ...Array.from(list)].slice(0, BLOG_POST_MAX_IMAGES),
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNote(null);
    if (!title.trim() && !text.trim() && files.length === 0) {
      setError(blogErrorText("post_empty"));
      return;
    }
    // Отправить длиннее предела нельзя, но и обрезать за человека нельзя:
    // счётчик уже сказал, сколько убрать, — ждём, пока уберёт.
    if (limit.over) {
      setError(limit.label);
      return;
    }

    setPending(true);
    try {
      const created = await createBlogPost({ title, text }, files);
      if (created.failed.length > 0) {
        setNote(
          `Не загрузились: ${created.failed
            .map((item) => `${item.name} — ${blogErrorText(item.reason)}`)
            .join("; ")}`,
        );
      }
      setTitle("");
      setText("");
      setFiles([]);
      onPublished?.(created.post);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError
          ? cause.message
          : "Не удалось опубликовать. Попробуйте ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <label htmlFor="blog-title" className="sr-only">
        Заголовок поста
      </label>
      <input
        id="blog-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={BLOG_POST_TITLE_MAX_LENGTH}
        placeholder="Заголовок — его видно в ленте"
        className="w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 font-display text-base text-text-0 placeholder:text-text-2"
      />
      <label htmlFor="blog-text" className="sr-only">
        Текст поста
      </label>
      {/* `maxLength` здесь больше нет (VED-371): браузер с ним молча
          перестаёт принимать знаки, а вставленный длинный текст так же
          молча обрезает с конца — человек не узнавал ни о пределе, ни о
          потере хвоста. Вместо него счётчик и отказ отправить форму. */}
      <textarea
        id="blog-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Что происходит?"
        aria-describedby={counterId}
        aria-invalid={limit.over || undefined}
        className="mt-2 w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-sm leading-6 text-text-0 placeholder:text-text-2"
      />
      <BlogTextCounter id={counterId} state={limit} />
      <BlogBlankLinesTool value={text} onChange={setText} disabled={pending} />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 rounded-lg border border-glass-brd bg-bg-1 px-2 py-1 text-xs text-text-1"
            >
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Убрать ${file.name}`}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
                className="text-text-2 hover:text-magenta"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-cyan/60">
          <ImagePlus aria-hidden className="size-4" />
          Фотографии
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={BLOG_IMAGE_MIME_TYPES.join(",")}
            onChange={(event) => pick(event.target.files)}
            className="sr-only"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
        >
          {pending ? "Публикую…" : "Опубликовать"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
      {note && <p className="mt-2 text-xs text-text-2">{note}</p>}
    </form>
  );
}
