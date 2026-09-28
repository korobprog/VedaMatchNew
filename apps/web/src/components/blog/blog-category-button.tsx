"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import type { BlogPostCategory } from "@vedamatch/shared";
import { MenuOptionLabel } from "@/components/menu-option";
import {
  blogCategoryAssignLabel,
  blogCategoryAssignOptions,
} from "./blog-feed-filters";
import { BlogMenuButton, blogMenuOptionClass } from "./blog-menu";

/**
 * «Назначить категорию» (VED-590): значок в ряду кнопок своего поста —
 * без формы правки, одним выбором. Показывать ли кнопку, решает страница по
 * `canEdit`; сервер проверяет то же право.
 */
export function BlogCategoryButton({
  value,
  onSelect,
}: {
  value: BlogPostCategory | null;
  /** Сохранить выбор. Ошибка показывается в меню, выбор не меняется. */
  onSelect: (category: BlogPostCategory | null) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = value ?? "";

  async function choose(next: BlogPostCategory | "", close: () => void) {
    setError(null);
    if (next === current) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSelect(next || null);
      close();
    } catch {
      setError("Не удалось сохранить категорию");
    } finally {
      setPending(false);
    }
  }

  return (
    <BlogMenuButton
      label={blogCategoryAssignLabel(value)}
      menuLabel="Категория поста"
      icon={<Tags aria-hidden className="size-4" />}
      busy={pending}
    >
      {(close) => (
        <>
          {blogCategoryAssignOptions().map((option) => (
            <button
              key={option.value || "none"}
              type="button"
              disabled={pending}
              aria-pressed={option.value === current}
              onClick={() => void choose(option.value, close)}
              className={blogMenuOptionClass(option.value === current)}
            >
              <MenuOptionLabel pressed={option.value === current}>
                {option.label}
              </MenuOptionLabel>
            </button>
          ))}
          {error && (
            <p role="alert" className="px-3 pt-1 text-xs text-magenta">
              {error}
            </p>
          )}
        </>
      )}
    </BlogMenuButton>
  );
}
