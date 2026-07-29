"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateLibraryCategoryConflict,
  LibraryCategorySuggestion,
  LibraryLocale,
  LibrarySectionDto,
} from "@vedamatch/shared";
import { pickLocalized, t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CategoryCreateForm({
  locale,
  sections,
}: {
  locale: LibraryLocale;
  sections: LibrarySectionDto[];
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [suggestions, setSuggestions] = useState<LibraryCategorySuggestion[]>(
    [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = (titleRu.trim() || titleEn.trim()).slice(0, 120);
    const controller = new AbortController();
    // Очистку тоже делаем внутри таймера: синхронный setState в эффекте
    // запрещён правилом react-hooks/set-state-in-effect.
    const timer = window.setTimeout(async () => {
      if (query.length < 3) {
        setSuggestions([]);
        return;
      }
      const response = await fetch(
        `${API_URL}/library/categories/suggest?q=${encodeURIComponent(query)}`,
        { credentials: "include", signal: controller.signal },
      ).catch(() => null);
      if (!response?.ok) return;
      setSuggestions((await response.json()) as LibraryCategorySuggestion[]);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [titleRu, titleEn]);

  async function submit(force: boolean) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/library/categories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          titleRu: titleRu.trim() || null,
          titleEn: titleEn.trim() || null,
          force,
        }),
      });

      if (res.status === 422) {
        const payload = (await res.json()) as {
          message?: CreateLibraryCategoryConflict;
        } & Partial<CreateLibraryCategoryConflict>;
        const conflict = payload.message ?? payload;
        setSuggestions(conflict.suggestions ?? []);
        setError(t(locale, "category.similar"));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }

      const created = (await res.json()) as {
        sectionSlug: string;
        slug: string;
      };
      router.push(`/library/${created.sectionSlug}/${created.slug}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      className="grid gap-4"
    >
      <label className="text-sm text-text-1">
        {t(locale, "filters.section")}
        <select
          value={sectionId}
          onChange={(event) => setSectionId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {pickLocalized(locale, {
                ru: section.titleRu,
                en: section.titleEn,
              })}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleRu")}
        <input
          value={titleRu}
          onChange={(event) => setTitleRu(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleEn")}
        <input
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      {(error || suggestions.length > 0) && (
        <div className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          <p>{error ?? t(locale, "category.similarHint")}</p>
          {suggestions.length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <a
                      href={`/library/${suggestion.sectionSlug}/${suggestion.slug}`}
                      className="underline"
                    >
                      {pickLocalized(locale, {
                        ru: suggestion.titleRu,
                        en: suggestion.titleEn,
                      })}
                    </a>
                    <span className="ml-2 text-text-2">
                      {suggestion.entriesCount}
                    </span>
                  </li>
                ))}
              </ul>
              {error === t(locale, "category.similar") && (
                <button
                  type="button"
                  onClick={() => void submit(true)}
                  disabled={pending}
                  className="mt-3 rounded-xl bg-glass-brd/40 px-3 py-1.5 text-sm hover:bg-glass-brd/60 disabled:opacity-50"
                >
                  {t(locale, "category.forceCreate")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "category.create")}
      </button>
    </form>
  );
}
