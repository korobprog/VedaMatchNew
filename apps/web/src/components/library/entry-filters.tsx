"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type {
  LibraryCategoryDto,
  LibraryEntryType,
  LibraryFeedSort,
  LibraryLocale,
} from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

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
const SORTS: LibraryFeedSort[] = ["new"];
const LANGUAGES = ["ru", "en"];

export function EntryFilters({
  locale,
  categories,
  categoryBasePath,
  currentCategorySlug,
}: {
  locale: LibraryLocale;
  categories: LibraryCategoryDto[];
  /**
   * Заданный на странице одной категории (`/library/[slug]`),
   * слаг категории — это сегмент пути, а не query. Смена значения в селекте
   * должна переходить на другой URL, иначе серверный компонент страницы
   * всё равно переопределит выбор фиксированным `categorySlug` из роута —
   * выбор в выпадающем списке молча игнорировался бы.
   */
  categoryBasePath?: string;
  /** Слаг текущей категории на странице `/library/[slug]`. */
  currentCategorySlug?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    router.push(`?${next.toString()}`);
  }

  function applyCategory(value: string) {
    if (!categoryBasePath) {
      apply("categorySlug", value);
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete("categorySlug");
    next.delete("cursor");
    const query = next.toString();
    const path = value ? `${categoryBasePath}/${value}` : categoryBasePath;
    router.push(query ? `${path}?${query}` : path);
  }

  return (
    <section className="glass mb-6 grid gap-3 rounded-2xl border border-glass-brd p-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.length > 0 && (
        <label className="text-sm text-text-1">
          {t(locale, "filters.category")}
          <select
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            value={
              categoryBasePath
                ? currentCategorySlug ?? ""
                : params.get("categorySlug") ?? ""
            }
            onChange={(event) => applyCategory(event.target.value)}
          >
            <option value="">{t(locale, "filters.all")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {pickLocalized(locale, {
                  ru: category.titleRu,
                  en: category.titleEn,
                })}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="text-sm text-text-1">
        {t(locale, "filters.type")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("type") ?? ""}
          onChange={(event) => apply("type", event.target.value)}
        >
          <option value="">{t(locale, "filters.all")}</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {entryTypeLabel(locale, type)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "filters.language")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("language") ?? ""}
          onChange={(event) => apply("language", event.target.value)}
        >
          <option value="">{t(locale, "filters.all")}</option>
          {LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "filters.sort")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("sort") ?? "new"}
          onChange={(event) => apply("sort", event.target.value)}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(locale, `sort.${sort}` as never)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
