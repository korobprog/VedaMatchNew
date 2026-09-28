"use client";

import { useId } from "react";
import type { BlogPostCategory } from "@vedamatch/shared";
import { LineageSelect } from "@/components/lineage-picker";
import { BlogCategorySelect } from "./blog-category-select";

const FIELD =
  "min-h-11 rounded-lg border border-glass-brd bg-bg-1 px-3 text-sm text-text-0 disabled:opacity-60";

/**
 * «Категория» и «Линия» в форме публикации и правки (VED-590): без обоих
 * пост не публикуется. Линия — портальный двухшаговый выбор (группа, затем
 * какой именно матх или паривар), как в Образовании и анкете; «Для всех» —
 * отдельный явный вариант, пустого нет.
 */
export function BlogPostMarksFields({
  category,
  lineage,
  onCategoryChange,
  onLineageChange,
  disabled = false,
}: {
  category: BlogPostCategory | "";
  /** `""` — не выбрана, `"all"` — для всех, иначе линия. */
  lineage: string;
  onCategoryChange: (value: BlogPostCategory | "") => void;
  onLineageChange: (value: string) => void;
  disabled?: boolean;
}) {
  const lineageId = useId();
  return (
    <>
      <BlogCategorySelect
        value={category}
        onChange={onCategoryChange}
        disabled={disabled}
      />
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {/* Подпись снаружи: у портального поля своя — второй ступенью
            цвета, а на стекле тёмной темы она ниже порога для 12px. */}
        <label
          htmlFor={lineageId}
          className="flex min-h-11 items-center text-xs text-text-1"
        >
          Линия
        </label>
        <LineageSelect
          id={lineageId}
          ariaLabel="Линия"
          value={lineage}
          onChange={onLineageChange}
          allLabel="Для всех"
          disabled={disabled}
          className={FIELD}
        />
      </div>
    </>
  );
}
