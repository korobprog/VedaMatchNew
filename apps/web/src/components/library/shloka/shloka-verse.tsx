import type { CSSProperties } from "react";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./shloka-font";
import { verseLines } from "./shloka-mode";

/**
 * Стих в оформлении (VED-386): тёплая подложка, тонкая золотая рамка,
 * орнамент и шрифт для санскрита. Цвета — только токены темы: подложка
 * смешивает `--vm-gold` с `--vm-bg-1`, поэтому в тёмной теме она тёмная,
 * в светлой — светлая, и текст `--vm-text-0` остаётся контрастным в обеих.
 */
const CARD_STYLE: CSSProperties = {
  background:
    "linear-gradient(160deg, color-mix(in srgb, var(--vm-gold) 14%, var(--vm-bg-1)) 0%, var(--vm-bg-1) 55%, color-mix(in srgb, var(--vm-magenta) 7%, var(--vm-bg-1)) 100%)",
  borderColor: "color-mix(in srgb, var(--vm-gold) 40%, transparent)",
};

export function ShlokaVerse({
  text,
  size = "lg",
}: {
  text: string;
  /** `md` — стих внутри блока ачарьи, он скромнее главного. */
  size?: "lg" | "md";
}) {
  const lines = verseLines(text);
  const large = size === "lg";
  return (
    <div
      className={`${verseFontVariables} relative overflow-hidden rounded-3xl border px-4 py-6 text-center text-text-0 sm:px-8 ${
        large ? "sm:py-8" : "py-5"
      }`}
      style={CARD_STYLE}
    >
      <Ornament />
      <div
        className="grid gap-1 break-words"
        style={{ fontFamily: VERSE_FONT_FAMILY }}
      >
        {lines.map((line, index) =>
          line.kind === "blank" ? (
            <span key={index} aria-hidden className="block h-3" />
          ) : line.kind === "devanagari" ? (
            <p
              key={index}
              lang="sa"
              className={`text-balance ${large ? "text-[1.25rem] leading-[1.9] sm:text-2xl" : "text-lg leading-[1.8] sm:text-xl"}`}
            >
              {line.text}
            </p>
          ) : (
            <p
              key={index}
              // Латиница с диакритикой — санскрит в IAST; кириллица —
              // транслитерация для русского читателя, язык у неё страницы.
              lang={/\p{Script=Cyrillic}/u.test(line.text) ? undefined : "sa-Latn"}
              className={`text-balance italic ${large ? "text-lg leading-8 sm:text-xl" : "text-base leading-7"}`}
            >
              {line.text}
            </p>
          ),
        )}
      </div>
      <Ornament flip />
    </div>
  );
}

/**
 * Орнамент над и под стихом — чистое украшение: скрыт от скринридера и
 * нарисован цветом `--vm-gold` через currentColor.
 */
function Ornament({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 240 24"
      className={`mx-auto block h-5 w-44 text-gold ${flip ? "mt-4 rotate-180" : "mb-4"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    >
      <path d="M8 12h78" opacity="0.55" />
      <path d="M154 12h78" opacity="0.55" />
      <path d="M92 12c8-8 16-8 22-2M148 12c-8-8-16-8-22-2" />
      <path d="M120 3c-6 5-6 13 0 18 6-5 6-13 0-18Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M108 12c4-5 8-6 12-4M132 12c-4-5-8-6-12-4" />
      <circle cx="86" cy="12" r="1.6" fill="currentColor" />
      <circle cx="154" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
