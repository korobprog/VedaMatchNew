"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WellnessKnowledgeCategoryDto } from "@vedamatch/shared";
import { getWellnessKnowledgeTree } from "@/lib/wellness-api";
import { isAbort } from "@/lib/is-abort";
import {
  articleCountLabel,
  subcategoryCountLabel,
  totalArticles,
} from "./knowledge-text";

/** Главные рубрики «Знаний» плитками. */
export function KnowledgeHome() {
  const [tree, setTree] = useState<WellnessKnowledgeCategoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWellnessKnowledgeTree(controller.signal)
      .then(setTree)
      .catch((cause) => {
        if (isAbort(cause)) return;
        setError("Не удалось загрузить рубрики");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!tree) {
    return (
      <p role="status" className="text-sm text-text-1">
        Загружаем…
      </p>
    );
  }
  if (!tree.length) {
    return <p className="text-sm text-text-1">Рубрик пока нет.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tree.map((root) => (
        <li key={root.id}>
          <Link
            href={`/wellness/knowledge/${root.slug}`}
            className="block h-full rounded-2xl border border-glass-brd bg-glass p-5"
          >
            <span className="block font-display text-xl font-bold text-text-0">
              {root.titleRu}
            </span>
            {root.descriptionRu && (
              <span className="mt-1 block text-sm text-text-1">
                {root.descriptionRu}
              </span>
            )}
            <span className="mt-3 block text-xs text-text-2">
              {subcategoryCountLabel(root.children.length)} ·{" "}
              {articleCountLabel(totalArticles(root))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
