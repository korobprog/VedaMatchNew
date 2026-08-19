"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MotivationAuthorPolicyDto } from "@vedamatch/shared";
import { apiRequest } from "../motivation-admin-api";
import { fieldClass, labelClass, primaryButton } from "./ui";

/**
 * Персональные правила автора. Пустой лимит означает «как у всех» — это не то
 * же самое, что ноль: ноль закрывает создание, а пусто отдаёт человека общему
 * лимиту сервиса, который потом можно менять одним местом.
 */
export function AuthorPolicyForm({
  userId,
  authorName,
  initial,
}: {
  userId: string;
  authorName: string;
  initial: MotivationAuthorPolicyDto | null;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(initial?.dailyLimit === null || initial === null ? "" : String(initial.dailyLimit));
  const [trusted, setTrusted] = useState(initial?.trusted ?? false);
  const [blocked, setBlocked] = useState(initial?.blocked ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      await apiRequest(`/admin/motivation/authors/${userId}/policy`, "PATCH", {
        dailyLimit: limit.trim() === "" ? null : Number(limit),
        trusted,
        blocked,
        note: note.trim() || null,
      });
      setState("saved");
      router.refresh();
    } catch (requestError) {
      setState("idle");
      setError(requestError instanceof Error ? requestError.message : "Не сохранилось");
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-3 rounded-2xl border border-glass-brd p-3">
      <p className="text-sm font-semibold text-text-0">Правила для автора: {authorName}</p>
      <label className={labelClass}>
        Личный лимит в день
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="как у всех"
          className={`mt-1 ${fieldClass} sm:max-w-[12rem]`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-text-1">
        <input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} />
        Доверенный автор — публиковать без проверки ИИ
      </label>
      <label className="flex items-center gap-2 text-sm text-text-1">
        <input type="checkbox" checked={blocked} onChange={(event) => setBlocked(event.target.checked)} />
        Запретить создавать рилсы
      </label>
      <label className={labelClass}>
        Заметка для админов
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          className={`mt-1 ${fieldClass}`}
          placeholder="почему сделано исключение"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === "saving"} className={primaryButton}>
          {state === "saving" ? "Сохраняем…" : "Сохранить правила"}
        </button>
        {state === "saved" && <span className="text-sm text-cyan">Сохранено</span>}
      </div>
    </form>
  );
}
