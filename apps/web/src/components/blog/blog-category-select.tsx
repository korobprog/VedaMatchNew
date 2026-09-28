"use client";

import type { BlogPostCategory } from "@vedamatch/shared";
import { blogCategoryAssignOptions } from "./blog-feed-filters";

/**
 * «Назначить категорию» в форме публикации и правки (VED-590): у каждого,
 * кто добавляет пост. Обычный список: пунктов четыре, и на телефоне
 * системный выбор удобнее своего меню. `""` — ещё не выбрана: пункт-подсказка
 * виден, но не выбирается — без категории пост не публикуется.
 *
 * Подпись «Категория» ставит форма (`BlogPostMarksFields`): она выравнивает
 * подписи всех трёх полей в одну колонку (VED-633).
 */
export function BlogCategorySelect({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: {
  id: string;
  value: BlogPostCategory | "";
  onChange: (value: BlogPostCategory | "") => void;
  disabled?: boolean;
  className: string;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange(event.target.value as BlogPostCategory | "")
      }
      aria-required
      className={className}
    >
      {value === "" && (
        <option value="" disabled>
          Выберите категорию
        </option>
      )}
      {blogCategoryAssignOptions().map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
