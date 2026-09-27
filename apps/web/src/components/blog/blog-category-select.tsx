"use client";

import { useId } from "react";
import type { BlogPostCategory } from "@vedamatch/shared";
import { blogCategoryAssignOptions } from "./blog-feed-filters";

/**
 * «Назначить категорию» в форме публикации и правки (VED-590): у каждого,
 * кто добавляет пост. Обычный список: пунктов пять, и на телефоне системный
 * выбор удобнее своего меню. `""` — «Без категории».
 */
export function BlogCategorySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: BlogPostCategory | "";
  onChange: (value: BlogPostCategory | "") => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-xs text-text-1">
        Категория
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as BlogPostCategory | "")
        }
        className="min-h-11 rounded-lg border border-glass-brd bg-bg-1 px-3 text-sm text-text-0 disabled:opacity-60"
      >
        {blogCategoryAssignOptions().map((option) => (
          <option key={option.value || "none"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
