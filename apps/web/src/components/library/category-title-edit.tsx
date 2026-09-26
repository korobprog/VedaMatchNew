"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { CategoryEditForm } from "./category-edit-form";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";

/**
 * Кнопка «Редактировать» на странице рубрики (VED-394).
 *
 * Рубрики вроде «Гуру → Е. С. Бхактивигьяна Г. М.» и «Проповедники → Ари
 * Мардан Прабху» — это и есть имя исполнителя: оно стоит заголовком
 * страницы, в хлебных крошках и на плитке у родителя. Править его можно было
 * только карандашом на плитке, уровнем выше; теперь — и из самой рубрики.
 * Название одно на все места показа, так что одна правка меняет его везде.
 *
 * Права те же, что у карандаша на плитке: автор рубрики и админ
 * (`canEdit` с сервера). Остальным кнопка не рисуется.
 */
export function CategoryTitleEdit({
  locale,
  category,
  iconOnly = false,
}: {
  locale: LibraryLocale;
  category: LibraryCategoryDto;
  /** Значком, без подписи на экране (VED-511) — ряд действий рубрики. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!category.canEdit) return null;

  const close = () => {
    setOpen(false);
    // Фокус — обратно на кнопку: иначе после «Отмена» или Esc он падает в
    // начало страницы, и клавиатуре снова идти через всю шапку.
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={t(locale, "category.editTitleLabel")}
        title={iconOnly ? t(locale, "category.editTitle") : undefined}
        className={
          iconOnly
            ? `${LIBRARY_ICON_BUTTON} ${
                open
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`
            : "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-glass-brd px-4 text-sm text-text-1 hover:text-text-0"
        }
      >
        <Pencil aria-hidden className="h-4 w-4" />
        {!iconOnly && t(locale, "category.editTitle")}
      </button>
      {open && (
        <div className="basis-full">
          <CategoryEditForm
            locale={locale}
            category={category}
            open
            onClose={close}
            autoFocus
          />
        </div>
      )}
    </>
  );
}
