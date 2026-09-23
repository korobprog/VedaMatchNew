"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  BLOG_IMAGE_MIME_TYPES,
  BLOG_POST_MAX_IMAGES,
  BLOG_POST_TITLE_MAX_LENGTH,
  type BlogImageDto,
  type BlogPostDto,
} from "@vedamatch/shared";
import {
  BlogApiError,
  blogErrorText,
  fetchBlogPost,
  updateBlogPost,
} from "@/lib/blog-client-api";
import { BlogBlankLinesTool } from "./blog-blank-lines-tool";
import { BlogTextCounter } from "./blog-text-counter";
import { blogTextLimitState } from "./blog-text-limit";

/**
 * Правка поста прямо в ленте (VED-321).
 *
 * Правятся и слова, и фотографии: без второго человек всё равно пойдёт
 * удалять пост и публиковать заново, а тогда кнопка правки не нужна вовсе.
 * Форма встаёт на место карточки, а не открывается отдельной страницей —
 * править приходится одну карточку из десятка, и уход со страницы теряет
 * место в ленте.
 */
export function BlogPostEditor({
  post,
  onSaved,
  onCancel,
}: {
  post: BlogPostDto;
  onSaved: (post: BlogPostDto) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(post.title ?? "");
  const [text, setText] = useState(post.text);
  const [kept, setKept] = useState<BlogImageDto[]>(post.images);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const limit = blogTextLimitState(text);
  /** Человек уже что-то поменял — обновлением с сервера это не затираем. */
  const touched = useRef(false);

  // Клавиатура иначе остаётся на кнопке, которой больше нет на экране.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  /**
   * Карточка приехала с SSR и могла устареть — например, фотографию
   * добавили с телефона, пока страница висела открытой. Список оставленных
   * картинок, собранный по такому экрану, унёс бы её молча, поэтому правка
   * начинается с того, что лежит на сервере сейчас.
   */
  useEffect(() => {
    let alive = true;
    fetchBlogPost(post.id)
      .then((fresh) => {
        if (!alive || touched.current) return;
        setTitle(fresh.title ?? "");
        setText(fresh.text);
        setKept(fresh.images);
      })
      .catch(() => {
        // Не доехало — правим то, что показано: отказ от правки из-за
        // неудачного обновления хуже устаревшего на минуту экрана.
      });
    return () => {
      alive = false;
    };
  }, [post.id]);

  const total = kept.length + files.length;

  function pick(list: FileList | null) {
    if (!list) return;
    touched.current = true;
    setFiles((current) =>
      [...current, ...Array.from(list)].slice(
        0,
        Math.max(0, BLOG_POST_MAX_IMAGES - kept.length),
      ),
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNote(null);
    if (!title.trim() && !text.trim() && total === 0) {
      setError(blogErrorText("post_empty"));
      return;
    }
    // Как и в публикации: обрезать за человека нельзя — это его слова.
    if (limit.over) {
      setError(limit.label);
      return;
    }

    setPending(true);
    try {
      const saved = await updateBlogPost(
        post.id,
        { title, text, keepImageIds: kept.map((image) => image.id) },
        files,
      );
      if (saved.failed.length > 0) {
        setNote(
          `Не загрузились: ${saved.failed
            .map((item) => `${item.name} — ${blogErrorText(item.reason)}`)
            .join("; ")}`,
        );
        setFiles([]);
        setKept(saved.post.images);
        setPending(false);
        return;
      }
      onSaved(saved.post);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError
          ? cause.message
          : "Не удалось сохранить. Попробуйте ещё раз.",
      );
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      /* Escape выходит из правки, как из любого временного режима: клавиатуре
         иначе остаётся только доехать табуляцией до «Отмены». Пока идёт
         сохранение — не трогаем, чтобы случайное нажатие не увело с экрана
         запрос, который уже ушёл. */
      onKeyDown={(event) => {
        if (event.key !== "Escape" || pending) return;
        event.stopPropagation();
        onCancel();
      }}
      aria-label="Правка поста"
      className="p-4"
    >
      <label htmlFor={`blog-edit-title-${post.id}`} className="sr-only">
        Заголовок поста
      </label>
      <input
        id={`blog-edit-title-${post.id}`}
        ref={firstFieldRef}
        value={title}
        onChange={(event) => {
          touched.current = true;
          setTitle(event.target.value);
        }}
        maxLength={BLOG_POST_TITLE_MAX_LENGTH}
        placeholder="Заголовок — его видно в ленте"
        className="min-h-11 w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 font-display text-base text-text-0 placeholder:text-text-2"
      />
      <label htmlFor={`blog-edit-text-${post.id}`} className="sr-only">
        Текст поста
      </label>
      {/* Без `maxLength` (VED-371) — см. ту же причину в форме публикации.
          Восемь строк, а не четыре: в поле теперь правят текст на восемь
          страниц, и в окошко на четыре строки его не прочитать. */}
      <textarea
        id={`blog-edit-text-${post.id}`}
        value={text}
        onChange={(event) => {
          touched.current = true;
          setText(event.target.value);
        }}
        rows={8}
        placeholder="Что происходит?"
        aria-describedby={counterId}
        aria-invalid={limit.over || undefined}
        className="mt-2 w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-sm leading-6 text-text-0 placeholder:text-text-2"
      />
      <BlogTextCounter id={counterId} state={limit} />
      {/* Уборка пустых строк (VED-372) стоит именно в правке: разорванный
          текст на скриншоте заказчика уже опубликован, и чинить его надо
          здесь. */}
      <BlogBlankLinesTool
        value={text}
        onChange={(next) => {
          touched.current = true;
          setText(next);
        }}
        disabled={pending}
      />

      {kept.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {kept.map((image, index) => (
            <li key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="aspect-square w-full rounded-t-lg bg-bg-2 object-cover"
              />
              <button
                type="button"
                aria-label={`Убрать фотографию ${index + 1}`}
                onClick={() => {
                  touched.current = true;
                  setKept((current) =>
                    current.filter((item) => item.id !== image.id),
                  );
                }}
                /* Под снимком, а не поверх него: палец требует 44px, а такой
                   кружок на узком экране закрывает собой пол-фотографии — по
                   ней потом не понять, какую именно убираешь. */
                className="flex min-h-11 w-full items-center justify-center gap-1 rounded-b-lg border border-t-0 border-glass-brd text-[11px] text-text-1 hover:text-magenta"
              >
                <X aria-hidden className="size-3.5" />
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd bg-bg-1 px-2 py-1 text-xs text-text-1"
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
                className="flex size-11 items-center justify-center text-text-2 hover:text-magenta"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-cyan/60 ${
            total >= BLOG_POST_MAX_IMAGES ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <ImagePlus aria-hidden className="size-4" />
          Добавить фотографии
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={BLOG_IMAGE_MIME_TYPES.join(",")}
            disabled={total >= BLOG_POST_MAX_IMAGES}
            onChange={(event) => pick(event.target.files)}
            className="sr-only"
          />
        </label>
        {/* Первая ступень текста: на тёмной теме вторая даёт 4,06:1 поверх
            стекла карточки — ниже порога для 12px. */}
        <span className="text-xs text-text-1">
          {total} из {BLOG_POST_MAX_IMAGES}
        </span>
        <span className="grow" />
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-11 rounded-lg border border-glass-brd px-3 py-2 text-sm text-text-1 hover:border-cyan/60 disabled:opacity-60"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-on-mint disabled:opacity-60"
        >
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-2 text-xs text-text-2">
          {note}
        </p>
      )}
    </form>
  );
}
