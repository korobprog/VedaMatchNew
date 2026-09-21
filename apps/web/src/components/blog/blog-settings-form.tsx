"use client";

import { useState } from "react";
import type { BlogSettingsDto } from "@vedamatch/shared";
import { BlogApiError, updateBlogSettings } from "@/lib/blog-client-api";

/**
 * Срок по умолчанию для новых постов — только администратору (VED-238:
 * «чтобы админы могли устанавливать время нахождения поста в Ленте»).
 *
 * Здесь же, на странице ленты, а не в общей админке: настройка ровно одна,
 * и ради неё заводить раздел незачем — админ правит её там, где видит
 * результат.
 */
const OPTIONS: { label: string; hours: number }[] = [
  { label: "12 часов", hours: 12 },
  { label: "Сутки", hours: 24 },
  { label: "3 дня", hours: 72 },
  { label: "Неделя", hours: 168 },
  { label: "Месяц", hours: 720 },
  { label: "Без срока", hours: 0 },
];

export function BlogSettingsForm({ initial }: { initial: BlogSettingsDto }) {
  const [hours, setHours] = useState(initial.feedLifetimeHours);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: number) {
    setHours(next);
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateBlogSettings(next);
      setHours(result.feedLifetimeHours);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError ? cause.message : "Не удалось сохранить.",
      );
    } finally {
      setPending(false);
    }
  }

  // Срок мог быть выставлен запросом мимо этого списка — показываем его
  // отдельным пунктом, иначе поле молча показывало бы чужое значение.
  const known = OPTIONS.some((option) => option.hours === hours);

  return (
    <section className="mb-6 rounded-2xl border border-glass-brd bg-glass p-4">
      <h2 className="font-display text-sm font-semibold text-text-0">
        Сколько пост держится в ленте
      </h2>
      <p className="mt-1 text-xs text-text-2">
        Срок по умолчанию для новых постов. У уже опубликованных он не
        меняется — их срок правится в самой карточке.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label htmlFor="blog-default-lifetime" className="sr-only">
          Срок по умолчанию
        </label>
        <select
          id="blog-default-lifetime"
          value={hours}
          disabled={pending}
          onChange={(event) => void apply(Number(event.target.value))}
          className="rounded-lg border border-glass-brd bg-bg-1 px-2.5 py-1.5 text-sm text-text-0 disabled:opacity-60"
        >
          {!known && <option value={hours}>{hours} ч</option>}
          {OPTIONS.map((option) => (
            <option key={option.hours} value={option.hours}>
              {option.label}
            </option>
          ))}
        </select>
        {saved && <span className="text-xs text-text-2">Сохранено</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
    </section>
  );
}
