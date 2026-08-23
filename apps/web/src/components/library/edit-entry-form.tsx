"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LibraryCategoryDto,
  LibraryEntryDto,
  LibraryEntryType,
  LibraryLocale,
  LibrarySectionDto,
  UpdateLibraryEntryRequest,
} from "@vedamatch/shared";
import { CategoryEditForm } from "./category-edit-form";
import { entryTypeLabel, pickLocalized, t, type LibraryTextKey } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORIES = 5;
const TYPES: LibraryEntryType[] = [
  "website",
  "article",
  "video",
  "audio",
  "book",
  "course",
  "app",
  "telegram_channel",
  "community",
  "other",
];

const ERROR_KEYS: Record<string, LibraryTextKey> = {
  unsupported_type: "add.unsupportedType",
  title_required: "add.titleRequired",
  title_too_long: "add.titleTooLong",
  description_too_long: "add.descriptionTooLong",
  category_required: "add.categoryRequired",
  too_many_categories: "add.tooManyCategories",
  category_not_found: "add.categoryNotFound",
};

/**
 * Правка ссылки скрыта за кнопкой: большинство читателей библиотеки её не
 * увидят вовсе (canEdit=false), а автору/админу не нужна лишняя форма на
 * странице, пока он не решил что-то поправить.
 */
export function EditEntryForm({
  locale,
  entry,
  sections,
  initialCategories,
}: {
  locale: LibraryLocale;
  entry: LibraryEntryDto;
  sections: LibrarySectionDto[];
  initialCategories: LibraryCategoryDto[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
      >
        {open ? t(locale, "entry.cancel") : t(locale, "entry.edit")}
      </button>

      {open && (
        <div className="mt-4 glass rounded-2xl border border-glass-brd p-4">
          <PreviewUploader locale={locale} entry={entry} />
          <EntryFieldsForm
            locale={locale}
            entry={entry}
            sections={sections}
            initialCategories={initialCategories}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function PreviewUploader({
  locale,
  entry,
}: {
  locale: LibraryLocale;
  entry: LibraryEntryDto;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setPending(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch(
        `${API_URL}/library/entries/${entry.id}/preview`,
        { method: "POST", credentials: "include", body },
      );
      if (res.status === 400) {
        const payload = (await res.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        const code = Array.isArray(payload?.message)
          ? payload?.message[0]
          : payload?.message;
        if (code === "unsupported_image_type") {
          setError(t(locale, "entry.previewUnsupportedType"));
        } else if (code === "preview_file_too_large") {
          setError(t(locale, "entry.previewTooLarge"));
        } else if (code === "preview_upload_unavailable") {
          setError(t(locale, "entry.previewUploadUnavailable"));
        } else {
          setError(t(locale, "entry.previewUploadFailed"));
        }
        return;
      }
      if (!res.ok) {
        setError(t(locale, "entry.previewUploadFailed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t(locale, "entry.previewUploadFailed"));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {entry.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3
        <img
          src={entry.previewUrl}
          alt=""
          className="h-16 w-28 rounded-lg border border-glass-brd object-cover"
        />
      )}
      <div>
        <label className="inline-block cursor-pointer rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0">
          {pending ? t(locale, "entry.previewUploading") : t(locale, "entry.uploadPreview")}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="hidden"
          />
        </label>
        {entry.hasCustomPreview && (
          <span className="ml-2 rounded-full bg-glass-brd/40 px-2 py-0.5 text-xs text-text-2">
            {t(locale, "entry.customPreview")}
          </span>
        )}
        {error && <p className="mt-1 text-xs text-magenta">{error}</p>}
      </div>
    </div>
  );
}

function EntryFieldsForm({
  locale,
  entry,
  sections,
  initialCategories,
  onDone,
}: {
  locale: LibraryLocale;
  entry: LibraryEntryDto;
  sections: LibrarySectionDto[];
  initialCategories: LibraryCategoryDto[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<LibraryEntryType>(entry.type);
  const [contentLanguage, setContentLanguage] = useState(entry.contentLanguage);
  const [titleRu, setTitleRu] = useState(entry.titleRu ?? "");
  const [titleEn, setTitleEn] = useState(entry.titleEn ?? "");
  const [descriptionRu, setDescriptionRu] = useState(entry.descriptionRu ?? "");
  const [descriptionEn, setDescriptionEn] = useState(entry.descriptionEn ?? "");
  const [sectionSlug, setSectionSlug] = useState(
    entry.categories[0]?.sectionSlug ?? sections[0]?.slug ?? "",
  );
  const [sectionCategories, setSectionCategories] = useState(initialCategories);
  const [selected, setSelected] = useState<LibraryCategoryDto[]>(
    initialCategories.filter((category) =>
      entry.categories.some((item) => item.id === category.id),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

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

    const body: UpdateLibraryEntryRequest = {
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
      const res = await apiFetch(`${API_URL}/library/entries/${entry.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400) {
        const payload = (await res.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        const code = Array.isArray(payload?.message)
          ? payload?.message[0]
          : payload?.message;
        setError(
          t(locale, (typeof code === "string" && ERROR_KEYS[code]) || "entry.updateFailed"),
        );
        return;
      }
      if (!res.ok) {
        setError(t(locale, "entry.updateFailed"));
        return;
      }
      setNotice(t(locale, "entry.updated"));
      router.refresh();
      onDone();
    } catch {
      setError(t(locale, "entry.updateFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-text-1">
          {t(locale, "add.type")}
          <select
            value={type}
            onChange={(event) => setType(event.target.value as LibraryEntryType)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            {TYPES.map((value) => (
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
        <label className="text-sm text-text-1">
          {t(locale, "add.titleRu")}
          <input
            value={titleRu}
            onChange={(event) => setTitleRu(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionRu")}
          <textarea
            value={descriptionRu}
            onChange={(event) => setDescriptionRu(event.target.value)}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionEn")}
          <textarea
            value={descriptionEn}
            onChange={(event) => setDescriptionEn(event.target.value)}
            rows={3}
            maxLength={MAX_DESCRIPTION_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
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
      </fieldset>

      {notice && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-1">
          {notice}
        </p>
      )}
      {error && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t(locale, "entry.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
        >
          {t(locale, "entry.cancel")}
        </button>
      </div>
    </form>
  );
}
