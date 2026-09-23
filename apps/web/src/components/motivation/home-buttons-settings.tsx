"use client";

import { useId, useState } from "react";
import { BookOpen, Images } from "lucide-react";
import type { HomeButtonOption } from "./home-buttons";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

/**
 * Настройка двух кнопок «Вдохновения» на главной (VED-401): «Обе кнопки
 * сделай, чтобы можно было перенастроить в настройках ленты любому
 * участнику».
 *
 * Хранится на сервере, в настройках ленты участника, а не в браузере: кнопки
 * рисует главная на сервере, и выбор, известный только одному телефону,
 * показал бы на другом устройстве снова Гиту.
 *
 * Пункты списков собирает страница (`sourceOptions`, `categoryOptions`):
 * там же, где известны источники и папки. Пустое значение — «по
 * умолчанию», и сохраняется как `null`, а не как название умолчания: если
 * редакция сменит умолчание, участник, который его не трогал, получит новое.
 */
export function MotivationHomeButtonsSettings({
  sources,
  categories,
  initialSource,
  initialCategory,
}: {
  sources: HomeButtonOption[];
  categories: HomeButtonOption[];
  initialSource: string;
  initialCategory: string;
}) {
  const sourceId = useId();
  const categoryId = useId();
  const [source, setSource] = useState(initialSource);
  const [category, setCategory] = useState(initialCategory);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setState("saving");
    try {
      const response = await apiFetch(`${apiBase()}/motivation/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          homeSourceWork: source || null,
          homeCategorySlug: category || null,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const field =
    "mt-2 min-h-11 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 text-base text-text-0";

  return (
    <section
      aria-labelledby={`${sourceId}-title`}
      className="mt-6 rounded-2xl border border-glass-brd bg-bg-1 p-4"
    >
      <h2
        id={`${sourceId}-title`}
        className="font-display text-lg font-bold text-text-0"
      >
        Кнопки на главной
      </h2>
      <p className="mt-1 text-sm text-text-1">
        В карточке «Вдохновения» на главной две кнопки: лента одного источника
        по порядку стихов и открытки одного раздела. Выберите, что они
        открывают.
      </p>

      <label
        htmlFor={sourceId}
        className="mt-4 flex items-center gap-2 text-sm font-semibold text-text-0"
      >
        <BookOpen aria-hidden className="size-4" />
        Первая кнопка — лента источника
      </label>
      <select
        id={sourceId}
        value={source}
        onChange={(event) => {
          setSource(event.target.value);
          setState("idle");
        }}
        className={field}
      >
        {sources.map((option) => (
          <option key={option.value || "default"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label
        htmlFor={categoryId}
        className="mt-4 flex items-center gap-2 text-sm font-semibold text-text-0"
      >
        <Images aria-hidden className="size-4" />
        Вторая кнопка — открытки раздела
      </label>
      <select
        id={categoryId}
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          setState("idle");
        }}
        className={field}
      >
        {categories.map((option) => (
          <option key={option.value || "default"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="min-h-11 rounded-xl border border-mint-edge bg-mint px-4 text-sm font-semibold text-on-mint disabled:opacity-50"
        >
          {state === "saving" ? "Сохраняем…" : "Сохранить кнопки"}
        </button>
        {/* Всегда в разметке: живая область, появившаяся вместе с текстом,
            скринридер пропускает. */}
        <p role="status" className="text-sm text-text-1">
          {state === "saved" && "Сохранено — кнопки на главной обновятся."}
          {state === "error" && "Не удалось сохранить. Попробуйте ещё раз."}
        </p>
      </div>
    </section>
  );
}
