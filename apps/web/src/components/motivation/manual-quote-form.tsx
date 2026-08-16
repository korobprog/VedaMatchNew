"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { MotivationCategoryDto } from "@vedamatch/shared";
import { apiRequest } from "./motivation-admin-api";
import { CollapsibleBlock } from "./collapsible-block";
import { CategorySelect } from "./admin/category-select";
import { PipelineStages } from "./admin/pipeline-stages";
import {
  cardClass,
  fieldClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "./admin/ui";

/**
 * Язык оригинала по алфавиту: кириллица — русский, деванагари — хинди, иначе
 * английский. Угадывание всегда можно переключить вручную.
 */
export function detectLanguage(text: string): string {
  if (/\p{Script=Devanagari}/u.test(text)) return "hi";
  if (/\p{Script=Cyrillic}/u.test(text)) return "ru";
  return "en";
}

const emptyForm = {
  originalText: "",
  originalLanguage: "ru",
  author: "",
  work: "",
  locator: "",
  sourceUrl: "",
  contextExcerpt: "",
};

export function ManualQuoteForm({
  categories = [],
}: {
  categories?: MotivationCategoryDto[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [languageTouched, setLanguageTouched] = useState(false);
  const [category, setCategory] = useState(
    categories.find((item) => item.isDefault)?.slug ?? categories[0]?.slug ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [added, setAdded] = useState<{ quote: string; author: string } | undefined>();

  // Обязательны только текст и автор — остальное уточняется по желанию.
  const missing = [
    !form.originalText.trim() && "текст цитаты",
    !form.author.trim() && "автор",
  ].filter((item): item is string => Boolean(item));
  const requiredFilled = missing.length === 0;

  function update(field: keyof typeof form) {
    return (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateQuoteText(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const originalText = event.target.value;
    setForm((current) => ({
      ...current,
      originalText,
      ...(languageTouched
        ? {}
        : { originalLanguage: detectLanguage(originalText) }),
    }));
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    setAdded(undefined);
    try {
      await apiRequest("/admin/motivation/quotes", "POST", {
        originalText: form.originalText.trim(),
        originalLanguage: form.originalLanguage,
        author: form.author.trim(),
        work: form.work.trim() || undefined,
        locator: form.locator.trim() || undefined,
        sourceUrl: form.sourceUrl.trim() || undefined,
        contextExcerpt: form.contextExcerpt.trim() || undefined,
        category: category || undefined,
      });
      setAdded({
        quote: form.originalText.trim(),
        author: form.author.trim(),
      });
      setForm(emptyForm);
      setLanguageTouched(false);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось добавить цитату",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-text-0">Добавить цитату вручную</h2>
      <p className="mt-1 text-sm text-text-2">
        Достаточно текста и автора. Цитата попадёт в очередь «Цитаты и текст» — там
        нейросеть подготовит пояснение и переводы.
      </p>

      {added && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-cyan/40 bg-cyan/10 p-4"
        >
          <p className="flex items-center gap-2 font-medium text-text-0">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan" />
            Цитата добавлена
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-text-1">
            «{added.quote}» — {added.author}
          </p>
          <PipelineStages status="discovered" className="mt-3" />
          <Link
            href="/admin/motivation/queue"
            className={`${secondaryButton} mt-3`}
          >
            Открыть очередь
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <label className={labelClass}>
          <span>Текст цитаты (оригинал)</span>
          <textarea
            aria-label="Текст цитаты (оригинал)"
            value={form.originalText}
            onChange={updateQuoteText}
            rows={4}
            placeholder="Вставьте цитату дословно, без правок"
            className={`mt-2 ${fieldClass}`}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span>Автор</span>
            <input
              type="text"
              aria-label="Автор"
              value={form.author}
              onChange={update("author")}
              placeholder="Например: Шрила Прабхупада"
              className={`mt-2 ${fieldClass}`}
            />
          </label>
          <label className={labelClass}>
            <span>Язык оригинала</span>
            <select
              aria-label="Язык оригинала"
              value={form.originalLanguage}
              onChange={(event) => {
                setLanguageTouched(true);
                update("originalLanguage")(event);
              }}
              className={`mt-2 ${fieldClass}`}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </label>
        </div>

        <CategorySelect
          categories={categories}
          value={category}
          disabled={pending}
          onChange={setCategory}
        />

        <CollapsibleBlock title="Уточнить источник (необязательно)" tone="framed">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Произведение</span>
              <input
                type="text"
                aria-label="Произведение"
                value={form.work}
                onChange={update("work")}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <label className={labelClass}>
              <span>Глава/стих</span>
              <input
                type="text"
                aria-label="Глава/стих"
                value={form.locator}
                onChange={update("locator")}
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              <span>Ссылка на источник</span>
              <input
                type="url"
                aria-label="Ссылка на источник"
                value={form.sourceUrl}
                onChange={update("sourceUrl")}
                placeholder="https://..."
                className={`mt-2 ${fieldClass}`}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              <span>Контекст</span>
              <textarea
                aria-label="Контекст"
                value={form.contextExcerpt}
                onChange={update("contextExcerpt")}
                rows={3}
                className={`mt-2 ${fieldClass}`}
              />
              <span className="mt-1 block text-xs font-normal text-text-2">
                Без контекста пояснение строится только по самой цитате.
              </span>
            </label>
          </div>
        </CollapsibleBlock>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-500">
          {error}
        </p>
      )}
      {!requiredFilled && (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-text-1">
          Осталось заполнить: {missing.join(", ")}.
        </p>
      )}
      <button
        type="button"
        disabled={pending || !requiredFilled}
        onClick={submit}
        className={`${primaryButton} mt-4`}
      >
        {pending ? "Добавление…" : "Добавить в очередь"}
      </button>
    </div>
  );
}
