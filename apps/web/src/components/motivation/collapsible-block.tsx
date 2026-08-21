import { ChevronDown } from "lucide-react";

/**
 * Свёрнутый блок длинного текста.
 *
 * Построен на `<details>`, а не на состоянии React: работает без JS, доступен с
 * клавиатуры и не требует «use client» у страниц, которые его показывают.
 */
export function CollapsibleBlock({
  title,
  preview,
  defaultOpen = false,
  tone = "plain",
  children,
}: {
  title: string;
  /** Строка-затравка рядом с заголовком, пока блок свёрнут. */
  preview?: string;
  defaultOpen?: boolean;
  tone?: "plain" | "framed";
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={[
        "group",
        tone === "framed"
          ? "rounded-xl border border-glass-brd p-3 sm:p-4"
          : "",
      ].join(" ")}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-0 marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 text-text-2 transition-transform group-open:rotate-180" />
        <span>{title}</span>
        {preview && (
          <span className="min-w-0 flex-1 truncate text-sm font-normal text-text-2 group-open:hidden">
            {preview}
          </span>
        )}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
