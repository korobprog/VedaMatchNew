"use client";

import type { MotivationCategoryDto } from "@vedamatch/shared";
import { fieldLabelClass } from "./field-label";

/**
 * Выбор категории в мастере «Свой рилс» (VED-96).
 *
 * Раньше мастер спрашивал «трек ленты» — «Мудрость мира» или «Вайшнавская
 * мудрость». Это деление из тех времён, когда папок не было; сейчас лента
 * разложена по категориям — Философия, Веды, Вайшнавское, Психология, — и
 * рилс должен ложиться туда же, где его будут искать.
 *
 * Отдельно от админского `CategorySelect`: тот при пустом справочнике зовёт
 * «завести категорию», а участнику такая ссылка ведёт в закрытую админку.
 * Подкатегории — `<optgroup>` родителя, как и в админке: справочник приходит
 * плоским списком в порядке обхода дерева.
 */
export function ReelCategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: MotivationCategoryDto[];
  value: string;
  onChange: (slug: string) => void;
}) {
  if (categories.length === 0)
    return (
      <p className="text-sm text-text-2">
        Категории не загрузились — рилс ляжет в категорию по умолчанию, её
        можно будет поменять позже.
      </p>
    );

  const roots = categories.filter((category) => !category.parentId);
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parentId === parentId);

  return (
    <label className="block text-sm text-text-1">
      <span className={fieldLabelClass()}>Категория</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
      >
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
              <option value={root.slug}>{root.title} — целиком</option>
              {children.map((child) => (
                <option key={child.id} value={child.slug}>
                  {child.title}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <span className="mt-1 block text-xs text-text-2">
        Там рилс будут искать в «Категориях».
      </span>
    </label>
  );
}

/** С какой категории начать: помеченная по умолчанию, иначе первая. */
export function initialReelCategory(
  categories: readonly MotivationCategoryDto[],
): string {
  return (
    categories.find((category) => category.isDefault)?.slug ??
    categories[0]?.slug ??
    ""
  );
}
