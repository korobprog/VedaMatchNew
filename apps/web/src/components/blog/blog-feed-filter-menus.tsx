"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Landmark, Tags } from "lucide-react";
import {
  lineageGroupOf,
  lineageGroupFromFilter,
  soleLineageOfGroup,
  type BlogPostCategory,
  type LineageFilterValue,
  type LineageGroup,
} from "@vedamatch/shared";
import { lineageDetailOptions, lineageGroupOptions } from "@/lib/lineage-steps";
import { MenuOptionLabel } from "@/components/menu-option";
import {
  blogCategoryFilterLabel,
  blogCategoryFilterOptions,
  blogFeedHref,
  blogLineageFilterLabel,
} from "./blog-feed-filters";
import { BlogMenuButton, blogMenuOptionClass } from "./blog-menu";

/** Переход на ту же ленту с другим фильтром; адрес — источник правды. */
function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function go(patch: { category?: string | null; lineage?: string | null }) {
    const href = blogFeedHref(pathname, window.location.search, patch);
    startTransition(() => router.push(href, { scroll: false }));
  }
  return { go, pending };
}

/**
 * «Отфильтровать по категориям» (VED-590): значок в ряду кнопок ленты.
 * Выбранная категория остаётся в ленте одна, остальные скрыты; «Все» —
 * снять фильтр.
 */
export function BlogCategoryFilter({
  value,
}: {
  value: BlogPostCategory | null;
}) {
  const { go, pending } = useFilterNavigation();
  const current = value ?? "";
  return (
    <BlogMenuButton
      label={blogCategoryFilterLabel(value)}
      menuLabel="Категории постов"
      icon={<Tags aria-hidden className="size-4" />}
      active={value !== null}
      busy={pending}
    >
      {(close) =>
        blogCategoryFilterOptions().map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            aria-pressed={option.value === current}
            onClick={() => {
              close();
              if (option.value !== current) {
                go({ category: option.value || null });
              }
            }}
            className={blogMenuOptionClass(option.value === current)}
          >
            <MenuOptionLabel pressed={option.value === current}>
              {option.label}
            </MenuOptionLabel>
          </button>
        ))
      }
    </BlogMenuButton>
  );
}

/** Группа, к которой относится фильтр: линия или вся группа. */
function filterGroup(value: LineageFilterValue | null): LineageGroup | null {
  return lineageGroupOf(value) ?? lineageGroupFromFilter(value);
}

/**
 * «Фильтр по организациям» (VED-590, VED-596): значок-домик, как «Линия» в
 * Образовании, и выбор в два шага, как везде (VED-568): ISKCON сразу,
 * Гаудия-матх и Паривары раскрываются — вся группа или одна линия. Лента
 * показывает посты выбранной линии и посты «для всех» — без линии.
 */
export function BlogLineageFilter({
  value,
}: {
  value: LineageFilterValue | null;
}) {
  const { go, pending } = useFilterNavigation();
  const current = value ?? "";
  const currentGroup = filterGroup(value);
  // Пока человек не трогал группы, раскрыта группа текущего выбора: что
  // выбрано, видно сразу. `undefined` — «не трогал», `null` — «свернул».
  const [expanded, setExpanded] = useState<LineageGroup | null | undefined>(
    undefined,
  );
  const openGroup = expanded === undefined ? currentGroup : expanded;

  function choose(next: string, close: () => void) {
    close();
    if (next !== current) go({ lineage: next || null });
  }

  return (
    <BlogMenuButton
      label={blogLineageFilterLabel(value)}
      menuLabel="Фильтр по организациям"
      icon={<Landmark aria-hidden className="size-4" />}
      active={value !== null}
      busy={pending}
    >
      {(close) => (
        <>
          <button
            type="button"
            aria-pressed={current === ""}
            onClick={() => choose("", close)}
            className={blogMenuOptionClass(current === "")}
          >
            <MenuOptionLabel pressed={current === ""}>
              Все линии
            </MenuOptionLabel>
          </button>
          {lineageGroupOptions(true).map((option) => {
            const group = option.value as LineageGroup;
            const sole = soleLineageOfGroup(group);
            if (sole) {
              return (
                <button
                  key={group}
                  type="button"
                  title={option.title}
                  aria-pressed={current === sole}
                  onClick={() => choose(sole, close)}
                  className={blogMenuOptionClass(current === sole)}
                >
                  <MenuOptionLabel pressed={current === sole}>
                    {option.label}
                  </MenuOptionLabel>
                </button>
              );
            }
            const open = openGroup === group;
            return (
              <div key={group}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : group)}
                  className={`${blogMenuOptionClass(currentGroup === group)} justify-between`}
                >
                  {option.label}
                  <ChevronDown
                    aria-hidden
                    className={`size-4 shrink-0 transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {open && (
                  <div
                    role="group"
                    aria-label={option.label}
                    className="ml-3 border-l border-glass-brd pl-2"
                  >
                    {lineageDetailOptions(group).map((detail) => (
                      <button
                        key={detail.value}
                        type="button"
                        title={detail.title}
                        aria-pressed={detail.value === current}
                        onClick={() => choose(detail.value, close)}
                        className={blogMenuOptionClass(detail.value === current)}
                      >
                        <MenuOptionLabel pressed={detail.value === current}>
                          {detail.label}
                        </MenuOptionLabel>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </BlogMenuButton>
  );
}
