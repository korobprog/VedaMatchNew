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
} from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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

export function AddEntryForm({
  locale,
  categories,
}: {
  locale: LibraryLocale;
  categories: LibraryCategoryDto[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [type, setType] = useState<LibraryEntryType>("article");
  const [contentLanguage, setContentLanguage] = useState("ru");
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionRu, setDescriptionRu] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDuplicateId(null);

    if (!titleRu.trim() && !titleEn.trim()) {
      setError(t(locale, "add.titleRequired"));
      return;
    }
    if (categoryIds.length === 0) {
      setError(t(locale, "add.categoryRequired"));
      return;
    }

    const body: CreateLibraryEntryRequest = {
      url: url.trim(),
      type,
      contentLanguage,
      titleRu: titleRu.trim() || null,
      titleEn: titleEn.trim() || null,
      descriptionRu: descriptionRu.trim() || null,
      descriptionEn: descriptionEn.trim() || null,
      categoryIds,
    };

    setPending(true);
    try {
      const res = await fetch(`${API_URL}/library/entries`, {
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
      if (res.status === 400) {
        setError(t(locale, "add.unsupportedUrl"));
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
      <label className="text-sm text-text-1">
        {t(locale, "add.url")}
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          placeholder="https://"
          required
        />
      </label>

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
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionRu")}
          <textarea
            value={descriptionRu}
            onChange={(event) => setDescriptionRu(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionEn")}
          <textarea
            value={descriptionEn}
            onChange={(event) => setDescriptionEn(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
      </div>

      <fieldset className="text-sm text-text-1">
        <legend className="mb-2">{t(locale, "add.categories")}</legend>
        <div className="flex flex-wrap gap-3">
          {categories.map((category) => {
            const label = pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            });
            return (
              <label key={category.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={categoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

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
