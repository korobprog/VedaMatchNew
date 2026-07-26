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
    <details className="reader-surface rounded-2xl border p-4">
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
                className="reader-hover w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
              >
                {chapter.title}
              </button>
            </li>
          ))}
      </ol>
    </details>
  );
}
