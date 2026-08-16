"use client";

import type { MotivationCategoryDto } from "@vedamatch/shared";
import { fieldClass, labelClass } from "./ui";

/**
 * Селект категории. Подкатегории показываются как `<optgroup>` своего
 * родителя — плоский список из справочника уже приходит в порядке обхода дерева.
 */
export function CategorySelect({
  categories,
  value,
  disabled,
  label = "Категория",
  onChange,
}: {
  categories: MotivationCategoryDto[];
  value: string;
  disabled?: boolean;
  label?: string;
  onChange: (slug: string) => void;
}) {
  const roots = categories.filter((category) => !category.parentId);
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parentId === parentId);

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled || categories.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 ${fieldClass}`}
      >
        {categories.length === 0 && <option value="">Справочник пуст</option>}
        {roots.map((root) => {
          const children = childrenOf(root.id);
          if (children.length === 0)
            return (
              <option key={root.id} value={root.slug}>
                {root.title}
              </option>
            );
          return (
            <optgroup key={root.id} label={root.title}>
              <option value={root.slug}>{root.title} — без подкатегории</option>
              {children.map((child) => (
                <option key={child.id} value={child.slug}>
                  {child.title}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
