"use client";

import { useState } from "react";
import type { BlogPostDto } from "@vedamatch/shared";
import { BlogApiError, setBlogPostLifetime } from "@/lib/blog-client-api";
import { blogFeedCountdown } from "./blog-format";

/**
 * Срок нахождения поста в ленте — только для администратора (VED-238).
 *
 * Готовые сроки, а не поле ввода в часах: «сутки» и «неделя» — это то, чем
 * человек думает, а 168 в поле нужно ещё сосчитать. «Без срока» лежит в том
 * же списке: на бэкенде это ноль часов, и отдельный флажок рядом с числом
 * только добавил бы состояние.
 */
const OPTIONS: { label: string; hours: number | null }[] = [
  { label: "12 часов", hours: 12 },
  { label: "Сутки", hours: 24 },
  { label: "3 дня", hours: 72 },
  { label: "Неделя", hours: 168 },
  { label: "Месяц", hours: 720 },
  { label: "Без срока", hours: null },
];

export function BlogLifetimeControl({
  post,
  onChanged,
}: {
  post: BlogPostDto;
  onChanged?: (post: BlogPostDto) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = blogFeedCountdown(post.feedUntil);

  async function apply(hours: number | null) {
    setPending(true);
    setError(null);
    try {
      onChanged?.(await setBlogPostLifetime(post.id, hours));
    } catch (cause) {
      setError(
        cause instanceof BlogApiError ? cause.message : "Не удалось изменить.",
      );
    } finally {
      setPending(false);
    }
  }

  const selectId = `blog-lifetime-${post.id}`;

  return (
    <div className="border-t border-glass-brd px-4 py-3">
      <label
        htmlFor={selectId}
        className="block text-[11px] font-semibold uppercase tracking-wide text-text-2"
      >
        Срок в ленте
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          id={selectId}
          disabled={pending}
          defaultValue=""
          onChange={(event) => {
            const option = OPTIONS[Number(event.target.value)];
            if (option) void apply(option.hours);
          }}
          className="rounded-lg border border-glass-brd bg-bg-1 px-2 py-1.5 text-xs text-text-0 disabled:opacity-60"
        >
          <option value="" disabled>
            Выбрать срок
          </option>
          {OPTIONS.map((option, index) => (
            <option key={option.label} value={index}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-text-2">
          {post.feedUntil === null
            ? "сейчас без срока"
            : (countdown ?? "срок истёк, пост в архиве")}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
