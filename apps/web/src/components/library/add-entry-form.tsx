"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateLibraryEntryRequest,
  LibraryCategoryDto,
  LibraryDuplicateEntryConflict,
  LibraryEntryType,
  LibraryLocale,
  LibrarySectionDto,
} from "@vedamatch/shared";
import { CategoryCreateForm } from "./category-create-form";
import { CategoryEditForm } from "./category-edit-form";
import { entryTypeLabel, pickLocalized, t } from "./i18n";
import { apiFetch } from "@/lib/http-client";
import {
  badRequestKey,
  ENTRY_TYPES,
  MAX_CATEGORIES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
} from "./entry-draft";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function AddEntryForm({
  locale,
  categories,
  sections = [],
  initialSectionSlug,
}: {
  locale: LibraryLocale;
  categories: LibraryCategoryDto[];
  sections?: LibrarySectionDto[];
  initialSectionSlug?: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [type, setType] = useState<LibraryEntryType>("article");
  const [contentLanguage, setContentLanguage] = useState("ru");
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionRu, setDescriptionRu] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [sectionSlug, setSectionSlug] = useState(
    initialSectionSlug ?? sections[0]?.slug ?? "",
  );
  const [sectionCategories, setSectionCategories] = useState(categories);
  // Выбранные держим целиком: категория из другого раздела должна остаться
  // видимой в списке после переключения раздела.
  const [selected, setSelected] = useState<LibraryCategoryDto[]>([]);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const visibleCategories = [
    ...sectionCategories,
    ...selected.filter(
      (item) => !sectionCategories.some((known) => known.id === item.id),
    ),
  ];

  function toggleCategory(category: LibraryCategoryDto) {
    setSelected((current) =>
      current.some((item) => item.id === category.id)
        ? current.filter((item) => item.id !== category.id)
        : [...current, category],
    );
  }

  function handleCategoryRenamed(updated: LibraryCategoryDto) {
    setSectionCategories((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setSelected((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function changeSection(slug: string) {
    setSectionSlug(slug);
    if (!slug) return;
    const response = await apiFetch(
      `${API_URL}/library/categories/section/${encodeURIComponent(slug)}`,
      { credentials: "include" },
    ).catch(() => null);
    if (!response?.ok) return;
    setSectionCategories((await response.json()) as LibraryCategoryDto[]);
  }

  function handleCategoryCreated(category: LibraryCategoryDto) {
    setSectionCategories((current) =>
      current.some((item) => item.id === category.id)
        ? current
        : [...current, category],
    );
    setSelected((current) =>
      current.some((item) => item.id === category.id)
        ? current
        : [...current, category],
    );
    setCategoryFormOpen(false);
    setNotice(t(locale, "add.categoryCreated"));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setDuplicateId(null);

    const trimmedUrl = url.trim();
    if (trimmedUrl.length > MAX_URL_LENGTH) {
      setError(t(locale, "add.urlTooLong"));
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(trimmedUrl)) {
      setError(t(locale, "add.unsupportedUrl"));
      return;
    }
    if (!titleRu.trim() && !titleEn.trim()) {
      setError(t(locale, "add.titleRequired"));
      return;
    }
    if (
      titleRu.trim().length > MAX_TITLE_LENGTH ||
      titleEn.trim().length > MAX_TITLE_LENGTH
    ) {
      setError(t(locale, "add.titleTooLong"));
      return;
    }
    if (
      descriptionRu.trim().length > MAX_DESCRIPTION_LENGTH ||
      descriptionEn.trim().length > MAX_DESCRIPTION_LENGTH
    ) {
      setError(t(locale, "add.descriptionTooLong"));
      return;
    }
    if (selected.length === 0) {
      setError(t(locale, "add.categoryRequired"));
      return;
    }
    if (selected.length > MAX_CATEGORIES) {
      setError(t(locale, "add.tooManyCategories"));
      return;
    }

    const body: CreateLibraryEntryRequest = {
      url: trimmedUrl,
      type,
      contentLanguage,
      titleRu: titleRu.trim() || null,
      titleEn: titleEn.trim() || null,
      descriptionRu: descriptionRu.trim() || null,
      descriptionEn: descriptionEn.trim() || null,
      categoryIds: selected.map((item) => item.id),
    };

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const payload = (await res.json()) as LibraryDuplicateEntryConflict;
        setDuplicateId(payload.entry?.id ?? null);
        setError(t(locale, "add.duplicate"));
        return;
      }
      if (res.status === 429) {
        setError(t(locale, "add.rateLimited"));
        return;
      }
      if (res.status === 400) {
        setError(t(locale, await badRequestKey(res)));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }

      const created = (await res.json()) as { id: string };
      router.push(`/library/entry/${created.id}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {/* Подсказка — сиблинг label, а не её содержимое: внутри она попадает
          в доступное имя поля («Адрес ссылки Полный адрес вместе с https://»),
          и скринридер называет поле целой фразой. Описание вешаем через
          aria-describedby — оно читается отдельно от имени. */}
      <div>
        <label className="text-sm text-text-1">
          {t(locale, "add.url")}
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            placeholder="https://"
            maxLength={MAX_URL_LENGTH}
            aria-describedby="add-url-hint"
            required
          />
        </label>
        <span id="add-url-hint" className="mt-1 block text-xs text-text-2">
          {t(locale, "add.hintUrl")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-text-1">
          {t(locale, "add.type")}
          <select
            value={type}
            onChange={(event) => setType(event.target.value as LibraryEntryType)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            {ENTRY_TYPES.map((value) => (
              <option key={value} value={value}>
                {entryTypeLabel(locale, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-text-1">
          {t(locale, "add.language")}
          <select
            value={contentLanguage}
            onChange={(event) => setContentLanguage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.titleRu")}
            <input
              value={titleRu}
              onChange={(event) => setTitleRu(event.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              aria-describedby="add-title-hint"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            />
          </label>
          <span id="add-title-hint" className="mt-1 block text-xs text-text-2">
            {t(locale, "add.hintTitle")}
          </span>
        </div>
        <label className="text-sm text-text-1">
          {t(locale, "add.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <div>
          <label className="text-sm text-text-1">
            {t(locale, "add.descriptionRu")}
            <textarea
              value={descriptionRu}
              onChange={(event) => setDescriptionRu(event.target.value)}
              rows={3}
              maxLength={MAX_DESCRIPTION_LENGTH}
              aria-describedby="add-description-hint"
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            />
          </label>
          <span
            id="add-description-hint"
            className="mt-1 block text-xs text-text-2"
          >
            {t(locale, "add.hintDescription")} · {descriptionRu.length}/
            {MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionEn")}
          <textarea
            value={descriptionEn}
            onChange={(event) => setDescriptionEn(event.target.value)}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
          <span className="mt-1 block text-xs text-text-2">
            {descriptionEn.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </label>
      </div>

      {sections.length > 0 && (
        <label className="text-sm text-text-1">
          {t(locale, "add.section")}
          <select
            value={sectionSlug}
            onChange={(event) => void changeSection(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.slug}>
                {pickLocalized(locale, {
                  ru: section.titleRu,
                  en: section.titleEn,
                })}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="text-sm text-text-1">
        <legend className="mb-2">{t(locale, "add.categories")}</legend>
        <div className="flex flex-wrap gap-3">
          {visibleCategories.map((category) => {
            const label = pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            });
            return (
              <span key={category.id} className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={selected.some((item) => item.id === category.id)}
                    onChange={() => toggleCategory(category)}
                  />
                  {label}
                </label>
                <CategoryEditForm
                  locale={locale}
                  category={category}
                  onSaved={handleCategoryRenamed}
                />
              </span>
            );
          })}
        </div>

        {sections.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setCategoryFormOpen((open) => !open)}
              className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/40"
            >
              {categoryFormOpen
                ? t(locale, "add.categoryCancel")
                : `+ ${t(locale, "add.categoryNew")}`}
            </button>

            {/* Форма живёт внутри карточки добавления: заполненные поля
                ссылки при создании категории не теряются. */}
            {categoryFormOpen && (
              <div className="mt-3 rounded-xl border border-glass-brd p-3">
                <CategoryCreateForm
                  locale={locale}
                  sections={sections}
                  initialSectionSlug={sectionSlug}
                  onCreated={handleCategoryCreated}
                />
              </div>
            )}
          </div>
        )}
      </fieldset>

      {notice && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-1">
          {notice}
        </p>
      )}

      {error && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          {error}
          {duplicateId && (
            <Link
              href={`/library/entry/${duplicateId}`}
              className="ml-2 underline"
            >
              {t(locale, "add.duplicateOpen")}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "add.submit")}
      </button>
    </form>
  );
}
