import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import type { VedabaseChapterDocument, VedabaseReadingUnit } from "@vedamatch/shared";
import { applyMark, clearMarks, type ReaderMark } from "@/lib/vedabase/highlight-marks";
import { CopyBlockButton } from "./copy-block-button";

/** Выделение или заметка, привязанные к блоку стиха. */
export interface ChapterMark extends ReaderMark {
  unitId: string;
  block: string;
}

const fields: Array<{
  key: Exclude<keyof VedabaseReadingUnit, "id" | "title" | "sourceUrl">;
  label: string;
}> = [
  { key: "originalHtml", label: "Оригинал" },
  { key: "transliterationHtml", label: "Транслитерация" },
  { key: "synonymsHtml", label: "Пословный перевод" },
  { key: "translationHtml", label: "Перевод" },
  { key: "purportHtml", label: "Комментарий" },
  { key: "bodyHtml", label: "Текст" },
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
    /** Выделения и заметки главы — подсвечиваются в тексте (VED-662). */
    marks?: readonly ChapterMark[];
  }
>(function ChapterContent({ chapter, onUnitActivate, marks = [] }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Подсветка накладывается на готовый HTML главы и пересобирается целиком:
  // выделений в главе немного, а частичное обновление легко оставило бы
  // висящую обёртку от удалённого.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    clearMarks(root);
    for (const mark of marks) {
      const block = [
        ...root.querySelectorAll<HTMLElement>("[data-vedabase-block]"),
      ].find(
        (element) =>
          element.dataset.vedabaseBlock === mark.block &&
          element.closest<HTMLElement>("[data-unit-id]")?.dataset.unitId ===
            mark.unitId,
      );
      if (block) applyMark(block, mark);
    }
  }, [chapter, marks]);

  return (
    <div ref={setRoot} className="divide-y divide-[var(--reader-border)]">
      {chapter.units.map((unit) => (
        <article
          key={unit.id}
          id={unit.id}
          data-unit-id={unit.id}
          tabIndex={0}
          onClick={() => onUnitActivate(unit.id)}
          onFocus={() => onUnitActivate(unit.id)}
          className="scroll-mt-32 py-8 first:pt-0 focus-visible:outline-offset-8"
        >
          <h2 className="reader-accent text-center text-xl font-semibold">
            {unit.title}
          </h2>
          {fields.map(({ key, label }) => {
            const html = unit[key];
            if (!html) return null;
            const safeHtml = sanitizeReaderHtml(html);
            return (
              <section key={key} className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="reader-muted text-xs font-semibold uppercase tracking-wide">
                    {label}
                  </h3>
                  <CopyBlockButton html={safeHtml} label={`${unit.title}, ${label}`} />
                </div>
                <div
                  data-vedabase-block={key}
                  data-testid={`block-${unit.id}-${key}`}
                  className="space-y-3 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
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
