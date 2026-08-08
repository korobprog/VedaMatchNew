"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "./motivation-admin-api";

const fieldClass =
  "min-w-[240px] flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const emptyForm = {
  originalText: "",
  originalLanguage: "ru",
  author: "",
  work: "",
  locator: "",
  sourceUrl: "",
  contextExcerpt: "",
};

export function ManualQuoteForm() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const requiredFilled =
    form.originalText.trim() &&
    form.author.trim() &&
    form.work.trim() &&
    form.locator.trim() &&
    form.contextExcerpt.trim();

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    try {
      await apiRequest("/admin/motivation/quotes", "POST", {
        originalText: form.originalText.trim(),
        originalLanguage: form.originalLanguage,
        author: form.author.trim(),
        work: form.work.trim(),
        locator: form.locator.trim(),
        sourceUrl: form.sourceUrl.trim() || undefined,
        contextExcerpt: form.contextExcerpt.trim(),
      });
      setForm(emptyForm);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить цитату");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Добавить цитату вручную</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Цитата пройдёт тот же путь, что и найденные ИИ: попадёт в очередь «Цитаты и текст» ниже.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          <span>Текст цитаты (оригинал)</span>
          <textarea
            aria-label="Текст цитаты (оригинал)"
            value={form.originalText}
            onChange={update("originalText")}
            rows={2}
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
        <label className={labelClass}>
          <span>Язык оригинала</span>
          <select
            aria-label="Язык оригинала"
            value={form.originalLanguage}
            onChange={update("originalLanguage")}
            className={`mt-2 w-full ${fieldClass}`}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>
        <label className={labelClass}>
          <span>Автор</span>
          <input
            type="text"
            aria-label="Автор"
            value={form.author}
            onChange={update("author")}
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
        <label className={labelClass}>
          <span>Произведение</span>
          <input
            type="text"
            aria-label="Произведение"
            value={form.work}
            onChange={update("work")}
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
        <label className={labelClass}>
          <span>Глава/стих</span>
          <input
            type="text"
            aria-label="Глава/стих"
            value={form.locator}
            onChange={update("locator")}
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>Ссылка на источник (необязательно)</span>
          <input
            type="url"
            aria-label="Ссылка на источник"
            value={form.sourceUrl}
            onChange={update("sourceUrl")}
            placeholder="https://..."
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>Контекст</span>
          <textarea
            aria-label="Контекст"
            value={form.contextExcerpt}
            onChange={update("contextExcerpt")}
            rows={2}
            className={`mt-2 w-full ${fieldClass}`}
          />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      <button
        type="button"
        disabled={pending || !requiredFilled}
        onClick={submit}
        className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Добавление…" : "Добавить в очередь"}
      </button>
    </div>
  );
}
