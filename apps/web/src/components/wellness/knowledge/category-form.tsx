"use client";

import { useId, useState } from "react";
import type { WellnessKnowledgeCategoryDto } from "@vedamatch/shared";
import {
  createWellnessKnowledgeCategory,
  updateWellnessKnowledgeCategory,
} from "@/lib/wellness-api";

const field =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Подрубрика «Знаний»: новая под `parentId` или правка `category`.
 * Слаг сервер выводит из названия сам.
 */
export function CategoryForm({
  parentId,
  category,
  onDone,
  onCancel,
}: {
  parentId?: string;
  category?: WellnessKnowledgeCategoryDto;
  onDone: (saved: WellnessKnowledgeCategoryDto) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [titleRu, setTitleRu] = useState(category?.titleRu ?? "");
  const [titleEn, setTitleEn] = useState(category?.titleEn ?? "");
  const [descriptionRu, setDescriptionRu] = useState(
    category?.descriptionRu ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="rounded-2xl border border-glass-brd bg-glass p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const body = {
          titleRu,
          titleEn: titleEn.trim() || null,
          descriptionRu: descriptionRu.trim() || null,
        };
        const saving = category
          ? updateWellnessKnowledgeCategory(category.id, body)
          : createWellnessKnowledgeCategory({ ...body, parentId });
        saving
          .then(onDone)
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-display text-lg font-bold text-text-0">
        {category ? "Править рубрику" : "Новая подрубрика"}
      </p>

      <label htmlFor={`${id}-ru`} className="mt-3 block text-sm text-text-0">
        Название
      </label>
      <input
        id={`${id}-ru`}
        value={titleRu}
        onChange={(event) => setTitleRu(event.target.value)}
        maxLength={120}
        required
        className={field}
      />

      <label htmlFor={`${id}-en`} className="mt-3 block text-sm text-text-0">
        Название по-английски <span className="text-text-2">(для адреса)</span>
      </label>
      <input
        id={`${id}-en`}
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        maxLength={120}
        className={field}
      />

      <label htmlFor={`${id}-desc`} className="mt-3 block text-sm text-text-0">
        Описание
      </label>
      <textarea
        id={`${id}-desc`}
        value={descriptionRu}
        onChange={(event) => setDescriptionRu(event.target.value)}
        maxLength={500}
        rows={2}
        className={field}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !titleRu.trim()}
          className="rounded-xl bg-magenta px-4 py-2 text-sm font-medium text-bg-0 disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
