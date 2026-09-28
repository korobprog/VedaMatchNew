"use client";

import { useRef, useState } from "react";
import { Pencil, PencilLine } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { CategoryEditForm } from "./category-edit-form";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";

/**
 * Кнопка «Редактировать» на странице рубрики (VED-394).
 *
 * Рубрики вроде «Гуру → Е. С. Бхактивигьяна Г. М.» и «Проповедники → Ари
 * Мардан Прабху» — это и есть имя исполнителя: оно стоит заголовком
 * страницы, в хлебных крошках и на плитке у родителя. Кнопка правит только
 * заголовок этой страницы (`pageTitleRu`/`pageTitleEn`): заказчик просил,
 * чтобы в других местах сохранилось прежнее название.
 *
 * `target="title"` — соседняя кнопка со значком «карандаш с чертой»
 * (VED-614): правит само название рубрики (`titleRu`/`titleEn`) — то, что
 * стоит в общем списке проповедников, гуру и ачарьев на плитке у родителя,
 * в пути и в чипах карточек. Раньше его правили только карандашом на плитке
 * уровнем выше.
 *
 * Права те же, что у карандаша на плитке: автор рубрики и админ
 * (`canEdit` с сервера). Остальным кнопка не рисуется.
 */
export function CategoryTitleEdit({
  locale,
  category,
  iconOnly = false,
  target = "pageTitle",
}: {
  locale: LibraryLocale;
  category: LibraryCategoryDto;
  /** Значком, без подписи на экране (VED-511) — ряд действий рубрики. */
  iconOnly?: boolean;
  /** Что правит: заголовок этой страницы или название в общем списке. */
  target?: "pageTitle" | "title";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!category.canEdit) return null;

  const listTitle = target === "title";
  const Icon = listTitle ? PencilLine : Pencil;
  const label = t(
    locale,
    listTitle ? "category.editListTitleLabel" : "category.editTitleLabel",
  );
  const shortLabel = t(
    locale,
    listTitle ? "category.editListTitle" : "category.editTitle",
  );

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
        aria-label={label}
        title={iconOnly ? label : undefined}
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
        <Icon aria-hidden className="h-4 w-4" />
        {!iconOnly && shortLabel}
      </button>
      {open && (
        <div className="basis-full">
          <CategoryEditForm
            locale={locale}
            category={category}
            open
            onClose={close}
            autoFocus
            target={target}
          />
        </div>
      )}
    </>
  );
}
