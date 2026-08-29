"use client";

import { useState } from "react";
import type {
  LibraryCategoryDto,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { CategoryCreateForm } from "./category-create-form";
import { CategoryEditForm } from "./category-edit-form";
import { flattenTree } from "./category-tree";
import { pickLocalized, t } from "./i18n";

/**
 * Выбор рубрик у материала — одним списком по всему дереву.
 *
 * Раньше здесь было два шага: сначала раздел, потом его категории. С
 * деревом шаг лишний — отступ показывает уровень, а список целиком помещается
 * на экран. Заодно пропала ловушка: выбрав категорию и переключив раздел,
 * человек терял её из виду.
 */
export function CategoryPicker({
  locale,
  tree,
  selected,
  onToggle,
  onRenamed,
  onCreated,
  initialParentSlug,
  canCreateRoot = false,
}: {
  locale: LibraryLocale;
  tree: LibraryCategoryTreeNode[];
  selected: LibraryCategoryDto[];
  onToggle: (category: LibraryCategoryDto) => void;
  onRenamed: (category: LibraryCategoryDto) => void;
  onCreated: (category: LibraryCategoryDto) => void;
  initialParentSlug?: string;
  canCreateRoot?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const rows = flattenTree(tree);

  // Выбранное, но уже пропавшее из дерева (переехало или скрыто), обязано
  // остаться видимым: иначе человек не поймёт, почему материал числится
  // в рубрике, которой в списке нет.
  const orphans = selected.filter(
    (item) => !rows.some((row) => row.id === item.id),
  );

  return (
    <fieldset className="text-sm text-text-1">
      <legend className="mb-2">{t(locale, "add.categories")}</legend>

      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const label = pickLocalized(locale, {
            ru: row.node.titleRu,
            en: row.node.titleEn,
          });
          return (
            <li
              key={row.id}
              style={{ marginInlineStart: row.depth * 20 }}
              className="flex items-center gap-2"
            >
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={selected.some((item) => item.id === row.id)}
                  onChange={() => onToggle(row.node)}
                />
                {label}
              </label>
              <CategoryEditForm
                locale={locale}
                category={row.node}
                onSaved={onRenamed}
              />
            </li>
          );
        })}

        {orphans.map((category) => {
          const label = pickLocalized(locale, {
            ru: category.titleRu,
            en: category.titleEn,
          });
          return (
            <li key={category.id} className="flex items-center gap-2">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={label}
                  checked
                  onChange={() => onToggle(category)}
                />
                {label}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/40"
        >
          {creating
            ? t(locale, "add.categoryCancel")
            : `+ ${t(locale, "add.categoryNew")}`}
        </button>

        {/* Форма живёт внутри карточки добавления: заполненные поля
            материала при создании рубрики не теряются. */}
        {creating && (
          <div className="mt-3 rounded-xl border border-glass-brd p-3">
            <CategoryCreateForm
              locale={locale}
              tree={tree}
              initialParentSlug={initialParentSlug}
              canCreateRoot={canCreateRoot}
              onCreated={(category) => {
                setCreating(false);
                onCreated(category);
              }}
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}
