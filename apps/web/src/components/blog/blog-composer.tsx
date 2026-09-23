"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Film, ImagePlus, X } from "lucide-react";
import {
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
import {
  BLOG_MEDIA_ACCEPT,
  isBlogVideoFile,
  pickBlogFiles,
} from "./blog-file-pick";
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
  autoFocus = false,
}: {
  onPublished?: (post: BlogPostDto) => void;
  /** Пришли карандашом «Написать пост» с главной — курсор сразу в форму. */
  autoFocus?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const limit = blogTextLimitState(text);

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  /**
   * Фото и ролик (VED-116). Что сервер всё равно отвергнет — слишком большой
   * файл, второй ролик, .mov, — отсекаем сразу и говорим почему, а не гоним
   * мегабайты по мобильной сети ради отказа.
   */
  function pick(list: FileList | null) {
    if (!list) return;
    const result = pickBlogFiles(files, Array.from(list));
    setFiles(result.files);
    setNote(
      result.rejected.length > 0
        ? `Не добавлены: ${result.rejected
            .map((item) => `${item.name} — ${blogErrorText(item.reason)}`)
            .join("; ")}`
        : null,
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
        ref={titleRef}
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
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd bg-bg-1 pl-2 text-xs text-text-1"
            >
              {isBlogVideoFile(file) ? (
                <Film aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <ImagePlus aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Убрать ${file.name}`}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
                className="flex size-11 items-center justify-center text-text-1 hover:text-magenta"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {/* Фокус виден на самой подписи: поле выбора файла спрятано, и
            обводка на нём никому не видна. */}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-cyan/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta">
          <ImagePlus aria-hidden className="size-4" />
          Фото или ролик
          <span className="text-text-1">
            {files.length > 0 && `· ${files.length} из ${BLOG_POST_MAX_IMAGES}`}
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={BLOG_MEDIA_ACCEPT}
            onChange={(event) => pick(event.target.files)}
            className="sr-only"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
        >
          {pending
            ? files.some(isBlogVideoFile)
              ? "Загружаю ролик…"
              : "Публикую…"
            : "Опубликовать"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
      {/* Первая ступень, а не вторая: вторая на стекле тёмной темы ниже
          порога для 12px, а это сообщение надо прочитать. */}
      {note && (
        <p role="status" className="mt-2 text-xs text-text-1">
          {note}
        </p>
      )}
    </form>
  );
}
