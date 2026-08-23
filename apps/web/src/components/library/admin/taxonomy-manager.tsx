"use client";

import { useState } from "react";
import type { LibrarySectionDto } from "@vedamatch/shared";
import { CategoryCreateForm } from "../category-create-form";
import { SectionCreateForm } from "./section-create-form";

/**
 * Разделы и категории — админ заводит их здесь, а не только правит дубли.
 * Список разделов держим в состоянии: после создания раздела он сразу нужен
 * в пикере формы категории, без похода на сервер за свежими пропами.
 */
export function LibraryTaxonomyManager({
  initialSections,
}: {
  initialSections: LibrarySectionDto[];
}) {
  const [sections, setSections] = useState(initialSections);
  const [createdCategoryName, setCreatedCategoryName] = useState<string | null>(
    null,
  );

  return (
    <div className="mb-8 flex flex-col gap-6">
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
          Разделы
        </h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {sections.map((section) => (
            <li
              key={section.id}
              className="rounded-full border border-glass-brd px-3 py-1 text-sm text-text-1"
            >
              {section.titleRu}
              <span className="ml-2 text-text-2">{section.categoriesCount}</span>
            </li>
          ))}
        </ul>
        <SectionCreateForm
          onCreated={(created) =>
            setSections((current) => [...current, created])
          }
        />
      </div>

      <div>
        <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
          Новая категория
        </h2>
        <CategoryCreateForm
          locale="ru"
          sections={sections}
          onCreated={(created) => {
            setSections((current) =>
              current.map((section) =>
                section.id === created.sectionId
                  ? {
                      ...section,
                      categoriesCount: section.categoriesCount + 1,
                    }
                  : section,
              ),
            );
            setCreatedCategoryName(created.titleRu ?? created.titleEn ?? null);
          }}
        />
        {createdCategoryName && (
          <p className="mt-2 text-sm text-cyan">
            Категория «{createdCategoryName}» создана
          </p>
        )}
      </div>
    </div>
  );
}
