"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateLibraryCategoryConflict,
  LibraryCategoryDto,
  LibraryCategorySuggestion,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { LIBRARY_MAX_DEPTH } from "@vedamatch/shared";
import { flattenTree } from "./category-tree";
import { pickLocalized, t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CategoryCreateForm({
  locale,
  tree,
  initialParentSlug,
  canCreateRoot = false,
  onCreated,
}: {
  locale: LibraryLocale;
  tree: LibraryCategoryTreeNode[];
  /** Куда предлагать положить новую рубрику по умолчанию. */
  initialParentSlug?: string;
  /** Верхний уровень заводит только администрация — см. сервис. */
  canCreateRoot?: boolean;
  /** Задан — остаёмся на странице и отдаём рубрику вызывающей форме. */
  onCreated?: (category: LibraryCategoryDto) => void;
}) {
  const router = useRouter();
  // Родителем может быть не всякая рубрика: на предельной глубине вкладывать
  // уже некуда, и такие в списке не показываем.
  const parents = flattenTree(tree).filter(
    (row) => row.depth + 1 <= LIBRARY_MAX_DEPTH,
  );
  const [parentId, setParentId] = useState(
    parents.find((row) => row.node.slug === initialParentSlug)?.id ??
      parents[0]?.id ??
      "",
  );
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
      const response = await apiFetch(
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
      const res = await apiFetch(`${API_URL}/library/categories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: parentId || null,
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

      const created = (await res.json()) as LibraryCategoryDto;
      if (onCreated) {
        setTitleRu("");
        setTitleEn("");
        setSuggestions([]);
        onCreated(created);
        return;
      }
      router.push(`/library/${created.slug}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  const fields = (
    <>
      <label className="text-sm text-text-1">
        {t(locale, "filters.section")}
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        >
          {canCreateRoot && (
            <option value="">{t(locale, "tree.moveToRoot")}</option>
          )}
          {parents.map((row) => (
            <option key={row.id} value={row.id}>
              {`${"  ".repeat(row.depth)}${pickLocalized(locale, {
                ru: row.node.titleRu,
                en: row.node.titleEn,
              })}`}
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
                      href={`/library/${suggestion.slug}`}
                      className="underline"
                    >
                      {suggestion.ancestors.length > 0 && (
                        <span className="text-text-2">
                          {suggestion.ancestors
                            .map((ancestor) =>
                              pickLocalized(locale, {
                                ru: ancestor.titleRu,
                                en: ancestor.titleEn,
                              }),
                            )
                            .join(" / ")}
                          {" / "}
                        </span>
                      )}
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
        type={onCreated ? "button" : "submit"}
        onClick={onCreated ? () => void submit(false) : undefined}
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "category.create")}
      </button>
    </>
  );

  // Внутри формы добавления ссылки вложенный <form> невалиден, поэтому там
  // рендерим обычный контейнер и сами перехватываем Enter.
  if (onCreated) {
    return (
      <div
        className="grid gap-4"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          void submit(false);
        }}
      >
        {fields}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      className="grid gap-4"
    >
      {fields}
    </form>
  );
}
