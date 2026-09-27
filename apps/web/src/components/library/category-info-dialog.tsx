"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Info, X } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import {
  CATEGORY_INFO_MAX_LENGTH,
  CATEGORY_INFO_SECTIONS,
  categoryInfo,
  infoSectionsForView,
  linkifyInfoText,
  showCategoryInfoButton,
  tooLongInfoField,
  type CategoryInfo,
} from "./category-info";
import { pickLocalized, t } from "./i18n";

const API_URL = apiBase();

/**
 * «i» в плитке автора (VED-553): контакты, биография, ресурсы и расписание.
 * Кнопка — сосед ссылки на автора, а не её часть: кнопка внутри ссылки —
 * невалидная разметка, и нажатие на «i» заодно открывало бы страницу.
 *
 * Окно того же вида, что «Закладки»: шторка снизу на телефоне, диалог по
 * центру шире. Разделы — всегда все четыре, пустой подписан «Пока не
 * заполнено»; тому, кто правит рубрику, — ещё «Изменить» и четыре поля.
 *
 * Доработка VED-553: окно рисуется порталом в `body`. Плитка автора —
 * `.glass` с `backdrop-filter`, а такой предок становится точкой отсчёта
 * для `position: fixed`: окно вставало не поверх экрана, а поверх плитки,
 * у верхних авторов уезжало за край и показывало одно поле из четырёх.
 * Фон окна — сплошной `bg-bg-1`, не стекло: сквозь стекло просвечивал
 * список, и текст тонул «в тумане».
 */
export function CategoryInfoButton({
  locale,
  category,
}: {
  locale: LibraryLocale;
  category: LibraryCategoryDto;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Сохранённое здесь же: до `router.refresh()` пропсы ещё старые, и окно
  // показывало бы текст, который только что заменили.
  const [saved, setSaved] = useState<CategoryInfo | null>(null);
  const info = saved ?? categoryInfo(category);
  const [draft, setDraft] = useState<CategoryInfo>(info);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  const name = pickLocalized(locale, {
    ru: category.titleRu,
    en: category.titleEn,
  });
  const label = `${t(locale, "info.open")}: ${name}`;

  const close = useCallback(() => {
    setOpen(false);
    setEditing(false);
    setError(null);
    // Фокус — обратно на «i»: иначе после Esc он уходил бы в начало
    // страницы, и клавиатура теряла место в списке авторов.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    if (editing) firstFieldRef.current?.focus();
    else closeRef.current?.focus();
  }, [open, editing]);

  if (!showCategoryInfoButton({ ...category, ...info })) return null;

  const sections = infoSectionsForView(info);

  function startEditing() {
    setDraft(info);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
    // Кнопка «Изменить» появится только после перерисовки.
    requestAnimationFrame(() => editRef.current?.focus());
  }

  async function save() {
    if (tooLongInfoField(draft)) {
      setError(t(locale, "info.tooLong"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/library/categories/${category.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) {
        setError(t(locale, "info.failed"));
        return;
      }
      const updated = (await response.json()) as LibraryCategoryDto;
      setSaved(categoryInfo(updated));
      setEditing(false);
      requestAnimationFrame(() => editRef.current?.focus());
      router.refresh();
    } catch {
      setError(t(locale, "info.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-my-1 grid size-10 shrink-0 place-items-center rounded-lg text-text-2 transition-colors hover:text-text-0"
      >
        <Info aria-hidden className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-glass-brd bg-bg-1 p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2
                  id={titleId}
                  className="min-w-0 break-words font-display text-base font-semibold text-text-0"
                >
                  {name}
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label={t(locale, "info.close")}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-text-2 hover:text-text-0"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </div>

              {editing ? (
                <div className="flex flex-col gap-3">
                  {CATEGORY_INFO_SECTIONS.map(
                    ({ field, label: key }, index) => (
                      <label key={field} className="text-sm text-text-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-text-0">
                            {t(locale, key)}
                          </span>
                          <span className="font-mono text-xs text-text-2">
                            {draft[field].length}/{CATEGORY_INFO_MAX_LENGTH}
                          </span>
                        </span>
                        <textarea
                          ref={index === 0 ? firstFieldRef : undefined}
                          value={draft[field]}
                          maxLength={CATEGORY_INFO_MAX_LENGTH}
                          rows={4}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                          className="mt-1 w-full resize-y rounded-lg border border-glass-brd bg-bg-0 px-3 py-2 text-sm text-text-0"
                        />
                      </label>
                    ),
                  )}
                  {error && (
                    <p role="alert" className="text-sm text-text-0">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void save()}
                      className="btn-mint min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
                    >
                      {t(locale, "entry.save")}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="min-h-11 rounded-lg border border-glass-brd bg-bg-0 px-4 text-sm text-text-0"
                    >
                      {t(locale, "entry.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {sections.map((section) => (
                      <section
                        key={section.field}
                        className="rounded-xl border border-glass-brd bg-bg-0 p-3"
                      >
                        <h3 className="mb-1 font-display text-sm font-semibold text-text-0">
                          {t(locale, section.label)}
                        </h3>
                        {section.text ? (
                          <p className="whitespace-pre-line break-words text-sm text-text-0">
                            {linkifyInfoText(section.text).map((part, index) =>
                              part.kind === "link" ? (
                                <a
                                  key={index}
                                  href={part.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-0 underline underline-offset-2 hover:text-magenta"
                                >
                                  {part.value}
                                </a>
                              ) : (
                                part.value
                              ),
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-text-2">
                            {t(locale, "info.notFilled")}
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                  {category.canEdit && (
                    <button
                      ref={editRef}
                      type="button"
                      onClick={startEditing}
                      className="mt-4 min-h-11 rounded-lg border border-glass-brd bg-bg-0 px-4 text-sm text-text-0"
                    >
                      {t(locale, "info.edit")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
