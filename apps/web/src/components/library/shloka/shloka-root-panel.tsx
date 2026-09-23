"use client";

import { useId, useState } from "react";
import { FolderPlus } from "lucide-react";
import type { LibraryCategoryTreeNode, LibraryLocale } from "@vedamatch/shared";
import { CategoryCreateForm } from "../category-create-form";
import { st } from "./shloka-text";

/**
 * Рубрика «Шлоки» (VED-386): внутри — разделы по источникам. Раздел
 * заводится здесь же, общей формой рубрики с родителем по умолчанию —
 * этой рубрикой. Права те же, что везде в Образовании: подраздел может
 * завести любой вошедший, верхний уровень — только администрация.
 */
export function ShlokaRootPanel({
  locale,
  tree,
  categorySlug,
}: {
  locale: LibraryLocale;
  tree: LibraryCategoryTreeNode[];
  categorySlug: string;
}) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  return (
    <section className="glass mb-6 rounded-2xl border border-glass-brd p-4">
      <p className="mb-3 text-sm text-text-1">{st(locale, "root.hint")}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
      >
        <FolderPlus aria-hidden className="h-4 w-4" />
        {st(locale, open ? "root.hide" : "root.create")}
      </button>
      <div id={formId} hidden={!open} className="mt-4">
        {open && (
          <CategoryCreateForm
            locale={locale}
            tree={tree}
            initialParentSlug={categorySlug}
          />
        )}
      </div>
    </section>
  );
}
