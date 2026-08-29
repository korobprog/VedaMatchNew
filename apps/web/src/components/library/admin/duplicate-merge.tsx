"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LibraryAdminCategoryDto,
  LibraryAdminDuplicateGroup,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { mergeLibraryCategory } from "@/lib/library-admin-api";

/**
 * Слияние дублей. Категорию заводит любой участник, а проверка похожих при
 * создании только предупреждает — поэтому «Книги», «книги» и «Книги 📚»
 * живут рядом. Здесь их сводят в одну: записи переезжают, исходная гаснет.
 */
export function LibraryDuplicateMerge({
  groups,
}: {
  groups: LibraryAdminDuplicateGroup[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        Дублей не нашлось: у активных категорий разные названия.
      </p>
    );
  }

  async function merge(sourceId: string, targetId: string, label: string) {
    if (
      !window.confirm(
        `Слить «${label}»? Записи переедут, а сама категория погаснет. Отменить нельзя.`,
      )
    )
      return;

    setPendingId(sourceId);
    setError(null);
    try {
      await mergeLibraryCategory(sourceId, targetId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось слить");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      <ul className="space-y-3">
        {groups.map((group) => {
          // Первой идёт категория с наибольшим числом записей — в неё и
          // сливают: так переезжает меньше связей.
          const [main, ...rest] = group.categories;
          return (
            <li
              key={group.normalized}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <p className="font-mono text-xs text-text-2">
                совпадение: {group.normalized}
              </p>
              <p className="mt-1 text-sm text-text-1">
                Оставляем{" "}
                <b className="text-text-0">{main.titleRu ?? main.slug}</b> (
                {main.entriesCount} записей, {pathOf(main)})
              </p>

              <ul className="mt-3 space-y-2">
                {rest.map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-glass-brd p-3"
                  >
                    <span className="text-sm text-text-0">
                      {category.titleRu ?? category.slug}
                      <span className="ml-2 font-mono text-xs text-text-2">
                        {category.entriesCount} записей · {pathOf(category)}
                        {category.createdByName &&
                          ` · завёл ${category.createdByName}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pendingId === category.id}
                      onClick={() =>
                        void merge(
                          category.id,
                          main.id,
                          category.titleRu ?? category.slug,
                        )
                      }
                      className="rounded-xl border border-magenta/50 px-3 py-1.5 text-sm text-text-0 hover:bg-magenta/10 disabled:opacity-50"
                    >
                      Слить в «{main.titleRu ?? main.slug}»
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Путь рубрики словами: две одноимённые рубрики из разных веток иначе
 * неразличимы, а разводят в этом списке именно их.
 */
function pathOf(category: LibraryAdminCategoryDto): string {
  if (category.ancestors.length === 0) return "верхний уровень";
  return category.ancestors
    .map((ancestor) => ancestor.titleRu ?? ancestor.slug)
    .join(" / ");
}
