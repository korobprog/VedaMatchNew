"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type {
  MotivationCategoryDto,
  MotivationPictureResult,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  formatImageSize,
  pastedImageName,
  pastedImageRejection,
  pickClipboardType,
  pickPastedImage,
  REEL_IMAGE_MIME,
  withImageTypeFromName,
} from "./clipboard-image";
import { categoriesAcceptingStyle } from "./feed-style";
import { fieldLabelClass } from "./field-label";
import {
  ReelCategorySelect,
  initialReelCategory,
} from "./reel-category-select";

const API_URL = apiBase();

const inputClass =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0";

/**
 * «Готовая картинка с цитатой» — первым вариантом мастера (VED-97, VED-99).
 *
 * Мастер рилса начинается с набора цитаты текстом, а у открытки цитата уже
 * напечатана на картинке. Раньше человек перепечатывал её только затем, чтобы
 * дойти до шага с файлом, — зря потраченное время. Здесь файл первым, дальше
 * категория, автор и источник, и картинка сразу уходит в ленту: владелец
 * решил публиковать такие без модерации.
 *
 * Отдельный запрос, а не рилс: рилсу нужен текст, проверка текста и
 * генерация кадра, а готовой картинке — ни то, ни другое. Картинка не
 * обрезается: надпись у края пропала бы первой.
 */
export function PicturePublishForm({
  categories: allCategories,
  onPublished,
}: {
  categories: MotivationCategoryDto[];
  /** Учесть публикацию в дневном лимите, который мастер показывает сверху. */
  onPublished?: (result: MotivationPictureResult) => void;
}) {
  // Готовая картинка — открытка: только общие категории и категории
  // открыток (VED-139).
  const categories = useMemo(
    () => categoriesAcceptingStyle(allCategories, "cards"),
    [allCategories],
  );
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [category, setCategory] = useState(() =>
    initialReelCategory(categories),
  );
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [work, setWork] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<MotivationPictureResult | null>(
    null,
  );

  /** Берём только то, что примет сервер: отказ после отправки обиднее. */
  const acceptImage = useCallback((next: File | null) => {
    const rejection = pastedImageRejection(next);
    setImageError(rejection);
    if (!rejection) setFile(next);
  }, []);

  // Ctrl+V где угодно на экране: вставляют туда, куда смотрят.
  useEffect(() => {
    if (published) return;
    const onPaste = (event: ClipboardEvent) => {
      const picked = pickPastedImage(event.clipboardData?.files);
      if (!picked) return;
      event.preventDefault();
      acceptImage(picked);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [published, acceptImage]);

  /** Кнопка «Вставить» — единственный путь на телефоне, где Ctrl+V нет. */
  const pasteImage = useCallback(async () => {
    setImageError(null);
    if (!navigator.clipboard?.read) {
      setImageError(
        "Этот браузер не даёт читать буфер. Нажмите Ctrl+V или выберите картинку из галереи или из файлов.",
      );
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = pickClipboardType(item.types);
        if (!type) continue;
        const blob = await item.getType(type);
        acceptImage(new File([blob], pastedImageName(type, new Date()), { type }));
        return;
      }
      acceptImage(null);
    } catch {
      setImageError("Не удалось прочитать буфер. Разрешите доступ или выберите файл.");
    }
  }, [acceptImage]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (category) form.append("category", category);
    if (text.trim()) form.append("text", text.trim());
    if (author.trim()) form.append("author", author.trim());
    if (work.trim()) form.append("work", work.trim());
    try {
      const response = await apiFetch(`${API_URL}/motivation/pictures`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as MotivationPictureResult;
      setPublished(result);
      onPublished?.(result);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось опубликовать картинку",
      );
    } finally {
      setPending(false);
    }
  }

  function again() {
    setPublished(null);
    setFile(null);
    setText("");
    setAuthor("");
    setWork("");
    setError(null);
  }

  if (published) {
    return (
      <div role="status" className="glass space-y-3 rounded-2xl p-4 text-sm text-text-1">
        <p className="font-semibold text-text-0">Картинка опубликована</p>
        <p>Она уже в общей ленте и в выбранной категории, а у вас — в «Студии».</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/motivation?post=${encodeURIComponent(published.slug)}`}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Открыть в ленте
          </Link>
          <button
            type="button"
            onClick={again}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
          >
            Ещё картинку
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        {/* Подпись, а не заголовок (VED-203): декоративной разметки h2/h3
            здесь быть не должно, она ломает порядок заголовков экрана. Вид —
            общий с остальными подписями формы. */}
        <p className={`text-sm ${fieldLabelClass()}`}>
          Картинка с цитатой (JPEG, PNG или WebP)
        </p>
        {/* Две кнопки (VED-154): на Android поле с `accept` картинок
            открывает только галерею, а открытки часто лежат в «Загрузках» и
            папках мессенджеров — туда ведёт «Из файлов», поле без `accept`. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm font-medium text-text-1 hover:text-text-0"
          >
            🖼️ Из галереи
          </button>
          <button
            type="button"
            onClick={() => filesRef.current?.click()}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm font-medium text-text-1 hover:text-text-0"
          >
            📁 Из файлов
          </button>
          <input
            ref={galleryRef}
            type="file"
            hidden
            accept={REEL_IMAGE_MIME.join(",")}
            aria-label="Картинка с цитатой из галереи"
            onChange={(e) => {
              acceptImage(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <input
            ref={filesRef}
            type="file"
            hidden
            aria-label="Картинка с цитатой из файлов"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              acceptImage(picked ? withImageTypeFromName(picked) : null);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pasteImage}
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm font-medium text-text-1 hover:text-text-0"
          >
            📋 Вставить из буфера
          </button>
          <span className="text-xs text-text-2">
            Скопировали картинку — нажмите сюда. На компьютере работает и Ctrl+V.
          </span>
        </div>
        {file && (
          <p className="text-xs text-text-1">
            Картинка взята: {file.name} · {formatImageSize(file.size)}
          </p>
        )}
        {imageError && (
          <p role="status" className="text-xs text-magenta">
            {imageError}
          </p>
        )}
        <p className="text-xs text-text-2">
          Картинку не обрезаем — надпись останется целиком. Публикуйте только то,
          на что у вас есть права.
        </p>
      </div>

      <ReelCategorySelect
        categories={categories}
        value={category}
        onChange={setCategory}
      />

      {/* Видимого заголовка группы нет (VED-203): «Автор / источник» стоял
          над двумя полями с теми же самыми словами и читался как лишняя
          строка — ровно та жалоба, что уже разобрали у роликов. Имя группы
          для скринридера несёт `aria-label` на самом fieldset, и оно дословно
          такое же, как в мастере роликов. */}
      <fieldset
        className="space-y-2 rounded-2xl border border-glass-brd p-3"
        aria-label="Источник и автор"
      >
        <label className="block text-sm text-text-1">
          <span className={fieldLabelClass()}>Автор (необязательно)</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={120}
            placeholder="Кому принадлежат слова"
            className={inputClass}
          />
        </label>
        <label className="block text-sm text-text-1">
          <span className={fieldLabelClass()}>Источник (необязательно)</span>
          <input
            value={work}
            onChange={(e) => setWork(e.target.value)}
            maxLength={120}
            placeholder="Книга, лекция или ссылка"
            className={inputClass}
          />
        </label>
      </fieldset>

      <label className="block text-sm text-text-1">
        <span className={fieldLabelClass()}>Текст с картинки (необязательно)</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Перепечатывать не обязательно — но по тексту картинку найдут поиском"
          className={inputClass}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <p className="text-xs text-text-2">
        Публикуется сразу — в общую ленту и в выбранную категорию.
      </p>
      <button
        type="submit"
        disabled={!file || pending}
        className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? "Публикуем…" : "Опубликовать"}
      </button>
    </form>
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
