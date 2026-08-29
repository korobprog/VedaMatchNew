"use client";

import { useState } from "react";
import type { LibraryCategoryTreeNode } from "@vedamatch/shared";
import { CategoryCreateForm } from "../category-create-form";
import { LibraryTreeOrganizer } from "../tree-organizer";
import { insertIntoTree } from "../category-tree";

/**
 * Дерево рубрик в админке: та же раскладка, что и в сервисе.
 *
 * Отдельного «управления разделами» больше нет — разделов не осталось, а
 * порядок и вложенность правятся тем же редактором, что и на витрине. Здесь
 * он просто открыт сразу, без переключателя режима.
 */
export function LibraryTaxonomyManager({
  initialTree,
}: {
  initialTree: LibraryCategoryTreeNode[];
}) {
  const [tree, setTree] = useState(initialTree);
  const [createdName, setCreatedName] = useState<string | null>(null);

  return (
    <div className="mb-8 flex flex-col gap-6">
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
          Рубрики
        </h2>
        <LibraryTreeOrganizer locale="ru" initialTree={tree} />
      </div>

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
          Новая рубрика
        </h2>
        <CategoryCreateForm
          locale="ru"
          tree={tree}
          canCreateRoot
          onCreated={(created) => {
            setTree((current) => insertIntoTree(current, created));
            setCreatedName(created.titleRu ?? created.titleEn ?? null);
          }}
        />
        {createdName && (
          <p className="mt-2 text-sm text-cyan">
            Рубрика «{createdName}» создана
          </p>
        )}
      </div>
    </div>
  );
}
