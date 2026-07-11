import type { VedabaseBookManifest } from "@vedamatch/shared";

export function TableOfContents({
  chapters,
  currentChapterSlug,
  onNavigate,
}: {
  chapters: VedabaseBookManifest["chapters"];
  currentChapterSlug: string;
  onNavigate(chapterSlug: string): void;
}) {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer font-semibold">Table of contents</summary>
      <ol className="mt-3 space-y-1">
        {[...chapters]
          .sort((left, right) => left.order - right.order)
          .map((chapter) => (
            <li key={chapter.slug}>
              <button
                type="button"
                aria-current={chapter.slug === currentChapterSlug ? "page" : undefined}
                onClick={() => onNavigate(chapter.slug)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {chapter.title}
              </button>
            </li>
          ))}
      </ol>
    </details>
  );
}
