"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImagePlus, X } from "lucide-react";
import type {
  MotivationCategoryDto,
  MotivationPictureResult,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { REEL_IMAGE_MIME, formatImageSize } from "../clipboard-image";
import { CategorySelect } from "./category-select";
import {
  PICTURE_TEXT_MAX,
  addPictures,
  pictureSummary,
  picturesToSend,
  removePicture,
  updatePicture,
  type PictureItem,
} from "./picture-queue";
import { fieldClass, labelClass, primaryButton, secondaryButton } from "./ui";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

let lastId = 0;
const nextId = () => `picture-${++lastId}`;

/**
 * Готовые картинки с афоризмами — сразу в категорию (VED-87).
 *
 * Файлы уходят по одному, `multipart/form-data` через `apiFetch`, как в
 * «Своей картинке»: он сам обновит токен, если пачка грузится дольше, чем
 * живёт access-токен.
 */
export function PictureUploadForm({
  categories,
  initialCategory,
}: {
  categories: MotivationCategoryDto[];
  initialCategory?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(
    () =>
      categories.find((item) => item.slug === initialCategory)?.slug ??
      categories.find((item) => item.isDefault)?.slug ??
      categories[0]?.slug ??
      "",
  );
  const [author, setAuthor] = useState("");
  const [queue, setQueue] = useState<PictureItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  function addFiles(files: File[]) {
    if (sending || files.length === 0) return;
    const next = addPictures(queue, files, nextId);
    // Превью создаём здесь, в обработчике, а не эффектом по очереди: ссылка
    // на blob нужна ровно тем файлам, что только что добавили.
    const urls = Object.fromEntries(
      next
        .slice(queue.length)
        .map((item) => [item.id, URL.createObjectURL(item.file)]),
    );
    setQueue(next);
    setPreviews((current) => ({ ...current, ...urls }));
  }

  function remove(id: string) {
    const url = previews[id];
    if (url) URL.revokeObjectURL(url);
    setPreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setQueue((current) => removePicture(current, id));
  }

  // Пачка из тридцати открыток не должна держать blob-ссылки в памяти до
  // закрытия вкладки. Ref — чтобы уборка при уходе видела последние ссылки.
  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(
    () => () => {
      for (const url of Object.values(previewsRef.current))
        URL.revokeObjectURL(url);
    },
    [],
  );

  // Картинку, скопированную из мессенджера, вставляют прямо в страницу.
  // Слушатель один на всё время жизни формы и зовёт свежий `addFiles`.
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      addFilesRef.current(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const toSend = picturesToSend(queue);
  const summary = pictureSummary(queue);
  const categoryTitle =
    categories.find((item) => item.slug === category)?.title ?? category;

  async function send() {
    setSending(true);
    for (const item of toSend) {
      setQueue((current) =>
        updatePicture(current, item.id, { status: "uploading", message: null }),
      );
      try {
        const body = new FormData();
        body.append("file", item.file);
        body.append("category", category);
        if (item.text.trim()) body.append("text", item.text);
        if (author.trim()) body.append("author", author);
        const response = await apiFetch(`${API_URL}/admin/motivation/pictures`, {
          method: "POST",
          body,
        });
        if (!response.ok) {
          const message = await readError(response);
          setQueue((current) =>
            updatePicture(current, item.id, {
              status: "error",
              message,
              // 4xx — с файлом или полями что-то не так, повтор даст то же.
              retriable: response.status >= 500,
            }),
          );
          continue;
        }
        const result = (await response.json()) as MotivationPictureResult;
        setQueue((current) =>
          updatePicture(current, item.id, {
            status: "done",
            message: null,
            slug: result.slug,
          }),
        );
      } catch {
        setQueue((current) =>
          updatePicture(current, item.id, {
            status: "error",
            message: "Нет связи с сервером — попробуйте ещё раз",
            retriable: true,
          }),
        );
      }
    }
    setSending(false);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="glass max-w-3xl space-y-5 rounded-2xl border border-glass-brd p-5"
    >
      <CategorySelect
        categories={categories}
        value={category}
        disabled={sending}
        label="В какую категорию"
        onChange={setCategory}
      />

      <label className={labelClass}>
        <span>Автор цитаты (необязательно)</span>
        <input
          value={author}
          disabled={sending}
          maxLength={120}
          onChange={(event) => setAuthor(event.target.value)}
          placeholder="Например, Шрила Прабхупада"
          className={`mt-2 ${fieldClass}`}
        />
        <span className="mt-1 block text-xs font-normal text-text-2">
          Подпишется под каждой картинкой этой пачки.
        </span>
      </label>

      <div>
        <button
          type="button"
          disabled={sending}
          onClick={() => inputRef.current?.click()}
          className={secondaryButton}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          Выбрать картинки
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={REEL_IMAGE_MIME.join(",")}
          hidden
          aria-label="Картинки с афоризмами"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            // Сброс, иначе те же файлы второй раз не выберутся.
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-text-2">
          JPEG, PNG или WebP до 12 МБ. Можно выбрать несколько или вставить
          скопированную картинку (Ctrl+V). Картинка показывается целиком, без
          обрезки, и публикуется сразу.
        </p>
      </div>

      {queue.length > 0 && (
        <ul className="space-y-3" aria-label="Картинки к публикации">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 rounded-xl border border-glass-brd p-3"
            >
              {previews[item.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[item.id]}
                  alt=""
                  className="h-24 w-20 shrink-0 rounded-lg bg-bg-2 object-contain"
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-xs text-text-2">
                  {item.file.name} · {formatImageSize(item.file.size)}
                </p>
                <label className="block text-xs font-medium text-text-1">
                  <span>Текст с картинки (необязательно)</span>
                  <textarea
                    value={item.text}
                    disabled={sending || item.status === "done"}
                    maxLength={PICTURE_TEXT_MAX}
                    rows={2}
                    onChange={(event) =>
                      setQueue((current) =>
                        updatePicture(current, item.id, {
                          text: event.target.value,
                        }),
                      )
                    }
                    className={`mt-1 ${fieldClass}`}
                  />
                </label>
                <PictureStatusLine item={item} category={category} />
              </div>
              {item.status !== "uploading" && item.status !== "done" && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => remove(item.id)}
                  aria-label={`Убрать ${item.file.name}`}
                  className="h-8 w-8 shrink-0 rounded-lg text-text-2 hover:text-text-0"
                >
                  <X className="mx-auto h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-text-2">
        Текст с картинки помогает найти её поиском и прочитать тем, кто не
        видит экран. Без него картинка всё равно опубликуется.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || toSend.length === 0 || !category}
          className={primaryButton}
        >
          {sending
            ? "Публикуем…"
            : toSend.length > 0
              ? `Опубликовать в «${categoryTitle}»: ${toSend.length}`
              : "Опубликовать"}
        </button>
        {summary && !sending && (
          <p role="status" className="text-sm text-text-1">
            {summary}.{" "}
            <Link
              href={`/motivation/collections/${encodeURIComponent(category)}?view=photo`}
              className="text-cyan underline underline-offset-2"
            >
              Открыть категорию
            </Link>
          </p>
        )}
      </div>
    </form>
  );
}

function PictureStatusLine({
  item,
  category,
}: {
  item: PictureItem;
  category: string;
}) {
  if (item.status === "uploading")
    return <p className="text-xs text-text-1">Загружаем…</p>;
  if (item.status === "done")
    return (
      <p className="text-xs text-text-1">
        Опубликовано.{" "}
        {item.slug && (
          <Link
            href={`/motivation?post=${encodeURIComponent(item.slug)}&category=${encodeURIComponent(category)}`}
            className="text-cyan underline underline-offset-2"
          >
            Открыть
          </Link>
        )}
      </p>
    );
  if (item.status === "error")
    return (
      <p role="alert" className="text-xs font-medium text-red-500">
        {item.message ?? "Не удалось загрузить"}
      </p>
    );
  return null;
}

/**
 * Сервер отвечает человеческим текстом («Файл больше 12 МБ»), но Nest
 * заворачивает его в JSON `{ message }`. Показываем сам текст.
 */
async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(", ");
  } catch {
    // Не JSON — значит, уже текст.
  }
  return raw || "Не удалось загрузить картинку";
}
