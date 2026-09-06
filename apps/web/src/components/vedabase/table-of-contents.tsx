"use client";

import { useMemo, useState } from "react";
import type { VedabaseBookManifest } from "@vedamatch/shared";
import { groupChapters, parseChapterGroup } from "./chapter-groups";

/**
 * Оглавление книги.
 *
 * У Шримад-Бхагаватам и Чайтанья-чаритамриты главы нумеруются внутри песни
 * (лилы), а не сквозь всю книгу, и плоский список из трёхсот с лишним строк
 * не давал понять ни где ты сейчас, ни куда идти: одинаковые названия шли по
 * кругу. Здесь они собраны по песням и лилам, и раскрыта та песнь, в которой
 * человек читает.
 *
 * У книг без песней ровно та же разметка с единственной группой без
 * названия — так у оглавления один способ отрисовки на все пятнадцать книг.
 */
export function TableOfContents({
  bookSlug,
  chapters,
  currentChapterSlug,
  onNavigate,
}: {
  bookSlug: string;
  chapters: VedabaseBookManifest["chapters"];
  currentChapterSlug: string;
  onNavigate(chapterSlug: string): void;
}) {
  const groups = useMemo(
    () => groupChapters(bookSlug, chapters),
    [bookSlug, chapters],
  );
  const currentGroup = parseChapterGroup(currentChapterSlug)?.group ?? null;
  /* Какие песни раскрыты помимо текущей. Своё состояние, а не `<details>` на
     каждую: открытая песнь должна закрываться, когда человек ушёл в другую,
     а браузер сам про это ничего не знает. */
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());

  return (
    <details className="reader-surface rounded-2xl border p-4">
      <summary className="cursor-pointer font-semibold">Содержание</summary>
      <div className="mt-3 space-y-2">
        {groups.map((group) => {
          if (group.label === null)
            return (
              <ChapterList
                key="loose"
                chapters={group.chapters}
                currentChapterSlug={currentChapterSlug}
                onNavigate={onNavigate}
              />
            );

          const groupNumber = parseChapterGroup(group.chapters[0]!.slug)!.group;
          const isCurrent = groupNumber === currentGroup;
          const isOpen = isCurrent || opened.has(groupNumber);

          return (
            <section key={group.label}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpened((current) => {
                    const next = new Set(current);
                    if (next.has(groupNumber)) next.delete(groupNumber);
                    else next.add(groupNumber);
                    return next;
                  })
                }
                className="reader-hover flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors"
              >
                {group.label}
                <span className="reader-subtle text-xs font-normal">
                  {group.chapters.length}
                  {/* Стрелка декоративна: состояние уже сказано `aria-expanded`. */}
                  <span aria-hidden="true">{isOpen ? " ▾" : " ▸"}</span>
                </span>
              </button>
              {isOpen && (
                <ChapterList
                  chapters={group.chapters}
                  currentChapterSlug={currentChapterSlug}
                  onNavigate={onNavigate}
                  indented
                />
              )}
            </section>
          );
        })}
        {chapters.length === 0 && (
          <p className="reader-subtle px-3 py-2 text-sm">
            Оглавление этой книги пока не загружено.
          </p>
        )}
      </div>
    </details>
  );
}

function ChapterList({
  chapters,
  currentChapterSlug,
  onNavigate,
  indented = false,
}: {
  chapters: VedabaseBookManifest["chapters"];
  currentChapterSlug: string;
  onNavigate(chapterSlug: string): void;
  indented?: boolean;
}) {
  return (
    <ol className={`space-y-1 ${indented ? "ms-3" : ""}`}>
      {chapters.map((chapter) => (
        <li key={chapter.slug}>
          <button
            type="button"
            aria-current={
              chapter.slug === currentChapterSlug ? "page" : undefined
            }
            onClick={() => onNavigate(chapter.slug)}
            className="reader-hover w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
          >
            {chapter.title}
          </button>
        </li>
      ))}
    </ol>
  );
}
