import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Bold, Palette, PencilLine } from "lucide-react";
import type {
  SaveVedabaseColoringRequest,
  VedabaseChapterDocument,
  VedabaseColor,
  VedabaseColorBlock,
  VedabaseColoringDto,
  VedabaseColorSpan,
  VedabaseReadingUnit,
} from "@vedamatch/shared";
import { paintRange } from "@/lib/vedabase/color-spans";
import {
  applyColor,
  applyMark,
  clearMarks,
  type ReaderMark,
} from "@/lib/vedabase/highlight-marks";
import { selectionToRange } from "@/lib/vedabase/locators";
import { ColoringBar } from "./coloring-bar";
import { BlockSpeakButton } from "./block-speak-button";
import { CopyBlockButton } from "./copy-block-button";
import { sanskritSegments, unitHeading } from "./reader-text";

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
    /** Цветной перевод блоков главы (VED-683). */
    colorings?: readonly VedabaseColoringDto[];
    /** Админ Библиотеки: может раскрашивать. */
    canEditColors?: boolean;
    onSaveColoring?(request: SaveVedabaseColoringRequest): Promise<void>;
  }
>(function ChapterContent(
  {
    chapter,
    onUnitActivate,
    marks = [],
    colorings = [],
    canEditColors = false,
    onSaveColoring,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Стихи, где пословный перевод показан с санскритом жирным (VED-683). */
  const [boldUnits, setBoldUnits] = useState<ReadonlySet<string>>(new Set());
  /** Блоки («стих/блок»), где включён цветной перевод. */
  const [coloredOn, setColoredOn] = useState<ReadonlySet<string>>(new Set());
  /** Правка раскраски админом: один блок за раз, черновик отрезков. */
  const [editing, setEditing] = useState<{
    key: string;
    unitId: string;
    block: VedabaseColorBlock;
    spans: VedabaseColorSpan[];
    dirty: boolean;
  } | null>(null);
  const [colorHint, setColorHint] = useState<string | null>(null);
  const [colorPending, setColorPending] = useState(false);
  const savedSpans = (key: string): VedabaseColorSpan[] =>
    colorings.find((item) => `${item.unitId}/${item.block}` === key)?.spans ??
    [];
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
    const blockOf = (unitId: string, block: string) =>
      [...root.querySelectorAll<HTMLElement>("[data-vedabase-block]")].find(
        (element) =>
          element.dataset.vedabaseBlock === block &&
          element.closest<HTMLElement>("[data-unit-id]")?.dataset.unitId ===
            unitId,
      );
    // Сначала раскраска, поверх неё — выделения читателя.
    for (const key of coloredOn) {
      const [unitId, block] = key.split("/");
      const target = blockOf(unitId, block);
      const spans =
        editing?.key === key
          ? editing.spans
          : (colorings.find(
              (item) => item.unitId === unitId && item.block === block,
            )?.spans ?? []);
      if (target) for (const span of spans) applyColor(target, span);
    }
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
  }, [chapter, marks, boldUnits, coloredOn, colorings, editing]);

  function toggleColored(key: string) {
    setColoredOn((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (editing?.key === key) setEditing(null);
  }

  function paint(color: VedabaseColor | null) {
    const root = rootRef.current;
    if (!root || !editing) return;
    const range = selectionToRange(
      window.getSelection(),
      root,
      chapter.bookSlug,
      chapter.slug,
    );
    if (
      !range ||
      range.locator.unitId !== editing.unitId ||
      range.range.block !== editing.block
    ) {
      setColorHint("Сначала выделите слова именно в этом блоке.");
      return;
    }
    setColorHint(null);
    setEditing({
      ...editing,
      spans: paintRange(editing.spans, range.range.start, range.range.end, color),
      dirty: true,
    });
    window.getSelection()?.removeAllRanges();
  }

  async function saveColoring() {
    if (!editing || !onSaveColoring) return;
    setColorPending(true);
    try {
      await onSaveColoring({
        chapterSlug: chapter.slug,
        unitId: editing.unitId,
        block: editing.block,
        spans: editing.spans,
      });
      setEditing(null);
      setColorHint(null);
    } catch {
      setColorHint("Не сохранилось — проверьте связь и попробуйте ещё раз.");
    } finally {
      setColorPending(false);
    }
  }

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
            {unitHeading(unit.title)}
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
                  <div className="flex items-center gap-1.5">
                    {(key === "transliterationHtml" || key === "synonymsHtml") && (
                      <BlockSpeakButton
                        id={`${unit.id}/${key}`}
                        text={plainText(safeHtml)}
                        label={`${unit.title}, ${label}`}
                      />
                    )}
                    {(key === "transliterationHtml" || key === "synonymsHtml") &&
                      (canEditColors ||
                        savedSpans(`${unit.id}/${key}`).length > 0) && (
                        <button
                          type="button"
                          aria-pressed={coloredOn.has(`${unit.id}/${key}`)}
                          aria-label="Цветной перевод"
                          title="Цветной перевод"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleColored(`${unit.id}/${key}`);
                          }}
                          className="reader-muted reader-bordered reader-hover inline-flex size-8 flex-none items-center justify-center rounded-lg border aria-pressed:bg-[var(--reader-surface-2)] aria-pressed:text-[var(--reader-text)]"
                        >
                          <Palette aria-hidden className="size-4" />
                        </button>
                      )}
                    {canEditColors &&
                      (key === "transliterationHtml" || key === "synonymsHtml") &&
                      coloredOn.has(`${unit.id}/${key}`) && (
                        <button
                          type="button"
                          aria-pressed={editing?.key === `${unit.id}/${key}`}
                          aria-label="Править раскраску"
                          title="Править раскраску"
                          onClick={(event) => {
                            event.stopPropagation();
                            const blockKey = `${unit.id}/${key}`;
                            setColorHint(null);
                            setEditing(
                              editing?.key === blockKey
                                ? null
                                : {
                                    key: blockKey,
                                    unitId: unit.id,
                                    block: key as VedabaseColorBlock,
                                    spans: savedSpans(blockKey),
                                    dirty: false,
                                  },
                            );
                          }}
                          className="reader-muted reader-bordered reader-hover inline-flex size-8 flex-none items-center justify-center rounded-lg border aria-pressed:bg-[var(--reader-surface-2)] aria-pressed:text-[var(--reader-text)]"
                        >
                          <PencilLine aria-hidden className="size-4" />
                        </button>
                      )}
                    {key === "synonymsHtml" && (
                      <button
                        type="button"
                        aria-pressed={boldUnits.has(unit.id)}
                        aria-label="Санскрит жирным"
                        title="Санскрит жирным"
                        onClick={(event) => {
                          event.stopPropagation();
                          setBoldUnits((current) => {
                            const next = new Set(current);
                            if (next.has(unit.id)) next.delete(unit.id);
                            else next.add(unit.id);
                            return next;
                          });
                        }}
                        className="reader-muted reader-bordered reader-hover inline-flex size-8 flex-none items-center justify-center rounded-lg border aria-pressed:bg-[var(--reader-surface-2)] aria-pressed:text-[var(--reader-text)]"
                      >
                        <Bold aria-hidden className="size-4" />
                      </button>
                    )}
                    <CopyBlockButton html={safeHtml} label={`${unit.title}, ${label}`} />
                  </div>
                </div>
                {editing?.key === `${unit.id}/${key}` && (
                  <ColoringBar
                    pending={colorPending}
                    dirty={editing.dirty}
                    hint={colorHint}
                    onPaint={paint}
                    onSave={() => void saveColoring()}
                    onCancel={() => {
                      setEditing(null);
                      setColorHint(null);
                    }}
                  />
                )}
                {key === "synonymsHtml" && boldUnits.has(unit.id) ? (
                  // Тот же текст, что в разметке, — смещения выделений не
                  // съезжают; курсив исходника тут не нужен, нужен санскрит.
                  <div
                    data-vedabase-block={key}
                    data-testid={`block-${unit.id}-${key}`}
                    className="leading-relaxed"
                  >
                    <p>
                      {sanskritSegments(plainText(safeHtml)).map((segment, index) =>
                        segment.bold ? (
                          <strong key={index}>{segment.text}</strong>
                        ) : (
                          <span key={index}>{segment.text}</span>
                        ),
                      )}
                    </p>
                  </div>
                ) : (
                  <div
                    data-vedabase-block={key}
                    data-testid={`block-${unit.id}-${key}`}
                    className="space-y-3 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                  />
                )}
              </section>
            );
          })}
        </article>
      ))}
    </div>
  );
});

/** Текст блока как есть — то же, что видят смещения выделений. */
function plainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

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
