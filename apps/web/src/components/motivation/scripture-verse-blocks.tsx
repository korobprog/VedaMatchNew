"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchScriptureChapter } from "@/lib/motivation-client-api";
import {
  findVerseUnit,
  htmlToText,
  type ScriptureVerseRef,
} from "./scripture-verse";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./verse-font";

interface VerseParts {
  original: string;
  transliteration: string;
  synonyms: string;
}

/**
 * Санскрит, транслитерация и пословный перевод стиха под цитатой в окне
 * «Читать полностью» (VED-263). Текст — из Библиотеки, по адресу стиха.
 *
 * Пока глава грузится или если стиха в ней нет, блок ничего не рисует: окно
 * открывается сразу с цитатой, а блоки дорастают под ней. Заглушка «загрузка…»
 * мигала бы и у постов, для которых санскрита нет вовсе.
 *
 * Блоки свёрнуты: окно открывают дочитать перевод, а санскрит нужен не
 * каждому. `<details>` работает с клавиатуры и читается скринридером как
 * раскрывающийся без своего состояния.
 */
export function ScriptureVerseBlocks({
  verseRef,
}: {
  verseRef: ScriptureVerseRef;
}) {
  const { bookSlug, chapterSlug, verse } = verseRef;
  const [parts, setParts] = useState<VerseParts | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchScriptureChapter(bookSlug, chapterSlug).then((payload) => {
      if (!alive) return;
      const unit = findVerseUnit(payload, verse);
      const text = (value: unknown) =>
        typeof value === "string" ? htmlToText(value) : "";
      setParts(
        unit
          ? {
              original: text(unit.originalHtml),
              transliteration: text(unit.transliterationHtml),
              synonyms: text(unit.synonymsHtml),
            }
          : null,
      );
    });
    return () => {
      alive = false;
    };
  }, [bookSlug, chapterSlug, verse]);

  if (!parts || !(parts.original || parts.transliteration || parts.synonyms))
    return null;

  return (
    <section
      aria-label="Стих в оригинале"
      className={`${verseFontVariables} mt-4 divide-y divide-white/10 border-t border-white/10`}
    >
      {parts.original && (
        <VerseBlock title="Санскрит">
          {/* lang="sa": скринридер не читает деванагари как хинди, а браузер
              берёт для неё правила переноса и шрифт санскрита. */}
          <p
            lang="sa"
            className="whitespace-pre-line text-lg leading-8 text-white"
            style={{ fontFamily: VERSE_FONT_FAMILY }}
          >
            {parts.original}
          </p>
        </VerseBlock>
      )}
      {parts.transliteration && (
        <VerseBlock title="Транслитерация">
          <p
            className="whitespace-pre-line leading-7 text-white/90"
            style={{ fontFamily: VERSE_FONT_FAMILY }}
          >
            {parts.transliteration}
          </p>
        </VerseBlock>
      )}
      {parts.synonyms && (
        <VerseBlock title="Пословный перевод">
          <p
            className="whitespace-pre-line text-sm leading-6 text-white/85"
            style={{ fontFamily: VERSE_FONT_FAMILY }}
          >
            {parts.synonyms}
          </p>
        </VerseBlock>
      )}
    </section>
  );
}

function VerseBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      {/* Подпись — как у блоков читалки Библиотеки: мелкие прописные, чтобы
          ряд заголовков не спорил с самой цитатой выше. white/70 на подложке
          окна #1B0F2E — около 9:1. */}
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70 marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
        <span>{title}</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
