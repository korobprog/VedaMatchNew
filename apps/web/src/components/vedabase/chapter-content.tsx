import { forwardRef } from "react";
import type { VedabaseChapterDocument, VedabaseReadingUnit } from "@vedamatch/shared";

const fields: Array<{
  key: Exclude<keyof VedabaseReadingUnit, "id" | "title" | "sourceUrl">;
  label: string;
}> = [
  { key: "originalHtml", label: "Original" },
  { key: "transliterationHtml", label: "Transliteration" },
  { key: "synonymsHtml", label: "Synonyms" },
  { key: "translationHtml", label: "Translation" },
  { key: "purportHtml", label: "Purport" },
  { key: "bodyHtml", label: "Text" },
];

const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
]);
const removedTags = new Set(["script", "style", "iframe", "object", "embed", "img", "svg", "math"]);

export const ChapterContent = forwardRef<
  HTMLDivElement,
  {
    chapter: VedabaseChapterDocument;
    onUnitActivate(unitId: string): void;
  }
>(function ChapterContent({ chapter, onUnitActivate }, ref) {
  return (
    <div ref={ref} className="space-y-8">
      {chapter.units.map((unit) => (
        <article
          key={unit.id}
          id={unit.id}
          data-unit-id={unit.id}
          tabIndex={0}
          onClick={() => onUnitActivate(unit.id)}
          onFocus={() => onUnitActivate(unit.id)}
          className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-xl font-semibold">{unit.title}</h2>
          {fields.map(({ key, label }) => {
            const html = unit[key];
            if (!html) return null;
            return (
              <section key={key} className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {label}
                </h3>
                <div
                  data-vedabase-block={key}
                  data-testid={`block-${unit.id}-${key}`}
                  className="space-y-3 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeReaderHtml(html) }}
                />
              </section>
            );
          })}
        </article>
      ))}
    </div>
  );
});

export function sanitizeReaderHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  sanitizeChildren(parsed.body);
  return parsed.body.innerHTML;
}

function sanitizeChildren(parent: ParentNode): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (removedTags.has(tag)) {
      element.remove();
      continue;
    }
    sanitizeChildren(element);
    if (!allowedTags.has(tag)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const href = tag === "a" ? safeHref(element.getAttribute("href")) : null;
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (href) {
      element.setAttribute("href", href);
      element.setAttribute("rel", "noreferrer noopener");
    }
  }
}

function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://vedabase.ru");
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
