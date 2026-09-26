"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, PencilLine } from "lucide-react";
import type {
  LibraryLocale,
  LibraryShlokaDto,
  LibraryShlokaNeighbor,
} from "@vedamatch/shared";
import { DeleteEntryButton } from "../delete-entry-button";
import { pickLocalized } from "../i18n";
import { ShlokaDisclosure } from "./shloka-disclosure";
import { ShlokaForm } from "./shloka-form";
import { ShlokaImages } from "./shloka-images";
import { arrowTarget, shlokaHref } from "./shloka-mode";
import { st } from "./shloka-text";
import { ShlokaVerse } from "./shloka-verse";

export type ShlokaViewMode = "read" | "edit";

/**
 * Окно шлоки (VED-386): стих, перевод, сворачиваемые пословный перевод и
 * комментарий, иллюстрации, «другие ачарьи»; стрелки по источнику и
 * переключатель «Чтение / Правка» для автора и админа.
 *
 * Режим живёт в адресе (`?mode=edit`): стрелка в правке ведёт в правку
 * соседней шлоки — источник заполняют подряд, — а обновление страницы не
 * выбрасывает из режима.
 */
export function ShlokaView({
  locale,
  shloka,
  initialMode,
}: {
  locale: LibraryLocale;
  shloka: LibraryShlokaDto;
  initialMode: ShlokaViewMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<ShlokaViewMode>(
    shloka.canEdit ? initialMode : "read",
  );
  const dirtyRef = useRef(false);
  const editing = mode === "edit";

  const switchMode = useCallback(
    (next: ShlokaViewMode) => {
      if (next === mode) return;
      if (
        mode === "edit" &&
        dirtyRef.current &&
        !window.confirm(st(locale, "view.leaveConfirm"))
      )
        return;
      dirtyRef.current = false;
      setMode(next);
      router.replace(next === "edit" ? `${pathname}?mode=edit` : pathname, {
        scroll: false,
      });
    },
    [mode, locale, pathname, router],
  );

  const go = useCallback(
    (neighbor: LibraryShlokaNeighbor | null) => {
      if (!neighbor) return;
      router.push(shlokaHref(neighbor.id, editing));
    },
    [router, editing],
  );

  // Клавиатурные стрелки ← → листают источник, но только в чтении и не
  // из поля ввода: в правке стрелка двигает курсор в тексте.
  useEffect(() => {
    if (editing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = arrowTarget(event);
      if (target === "prev" && shloka.prev) go(shloka.prev);
      if (target === "next" && shloka.next) go(shloka.next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, go, shloka.prev, shloka.next]);

  const guardLeave = (event: MouseEvent) => {
    if (
      editing &&
      dirtyRef.current &&
      !window.confirm(st(locale, "view.leaveConfirm"))
    )
      event.preventDefault();
  };

  const categoryTitle = shloka.category
    ? pickLocalized(locale, {
        ru: shloka.category.titleRu,
        en: shloka.category.titleEn,
      })
    : null;
  const heading = shloka.verse
    ? `${shloka.source} ${shloka.verse}`
    : shloka.titleRu ?? shloka.source;

  return (
    <article aria-labelledby="shloka-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-1">
          {shloka.category ? (
            <Link
              href={`/library/${shloka.category.slug}`}
              onClick={guardLeave}
              className="underline decoration-glass-brd underline-offset-4 hover:text-text-0"
            >
              {categoryTitle}
            </Link>
          ) : (
            shloka.source
          )}
          {shloka.position > 0 && (
            <span className="text-text-2">
              {" · "}
              {shloka.position} {st(locale, "view.position")} {shloka.total}
            </span>
          )}
        </p>

        {shloka.canEdit && (
          <div
            role="group"
            aria-label={st(locale, "view.mode")}
            className="inline-flex rounded-xl border border-glass-brd p-1"
          >
            {(["read", "edit"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => switchMode(value)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  mode === value
                    ? "bg-glass-brd/60 text-text-0"
                    : "text-text-1 hover:text-text-0"
                }`}
              >
                {value === "read" ? (
                  <BookOpen aria-hidden className="h-4 w-4" />
                ) : (
                  <PencilLine aria-hidden className="h-4 w-4" />
                )}
                {st(locale, value === "read" ? "view.read" : "view.edit")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <NeighborLink
          locale={locale}
          direction="prev"
          neighbor={shloka.prev}
          edit={editing}
          onClick={guardLeave}
        />
        <h1
          id="shloka-heading"
          className="text-center font-display text-lg font-bold text-text-0 sm:text-2xl"
        >
          {heading}
        </h1>
        <NeighborLink
          locale={locale}
          direction="next"
          neighbor={shloka.next}
          edit={editing}
          onClick={guardLeave}
        />
      </div>

      {editing ? (
        <>
          <ShlokaForm
            key={shloka.id}
            locale={locale}
            target={{ kind: "edit", shloka }}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
            onCancel={() => switchMode("read")}
            onSaved={() => {
              dirtyRef.current = false;
              setMode("read");
              router.replace(pathname, { scroll: false });
              router.refresh();
            }}
          />
          <div className="mt-8 border-t border-glass-brd pt-4">
            <DeleteEntryButton
              locale={locale}
              entryId={shloka.id}
              redirectTo={
                shloka.category ? `/library/${shloka.category.slug}` : "/library"
              }
            />
          </div>
        </>
      ) : (
        <ShlokaReading locale={locale} shloka={shloka} heading={heading} />
      )}

      {(shloka.prev || shloka.next) && (
        <nav
          aria-label={st(locale, "view.source")}
          className="mt-8 grid grid-cols-2 gap-3"
        >
          <NeighborLink
            locale={locale}
            direction="prev"
            neighbor={shloka.prev}
            edit={editing}
            onClick={guardLeave}
            wide
          />
          <NeighborLink
            locale={locale}
            direction="next"
            neighbor={shloka.next}
            edit={editing}
            onClick={guardLeave}
            wide
          />
        </nav>
      )}
      {!editing && (shloka.prev || shloka.next) && (
        <p className="mt-2 hidden text-center text-xs text-text-2 sm:block">
          {st(locale, "view.keyboardHint")}
        </p>
      )}
    </article>
  );
}

function NeighborLink({
  locale,
  direction,
  neighbor,
  edit,
  onClick,
  wide = false,
}: {
  locale: LibraryLocale;
  direction: "prev" | "next";
  neighbor: LibraryShlokaNeighbor | null;
  edit: boolean;
  onClick: (event: MouseEvent) => void;
  /** Нижняя пара — крупные кнопки с номером: под большой палец. */
  wide?: boolean;
}) {
  const label = st(locale, direction === "prev" ? "view.prev" : "view.next");
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const verse = neighbor?.verse ?? st(locale, "section.noVerse");

  if (!neighbor) {
    // Место держим пустым, а не убираем: иначе заголовок прыгал бы вбок
    // на первой и последней шлоке источника.
    return wide ? <span /> : <span className="h-11 w-11" aria-hidden />;
  }

  if (!wide) {
    return (
      <Link
        href={shlokaHref(neighbor.id, edit)}
        onClick={onClick}
        aria-label={`${label}: ${verse}`}
        title={`${label}: ${verse}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-glass-brd text-text-1 hover:bg-glass-brd/40 hover:text-text-0"
      >
        <Icon aria-hidden className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <Link
      href={shlokaHref(neighbor.id, edit)}
      onClick={onClick}
      className={`glass flex min-h-14 items-center gap-2 rounded-2xl border border-glass-brd px-4 py-2 text-text-0 hover:border-gold/60 ${
        direction === "next" ? "col-start-2 justify-end text-right" : ""
      }`}
    >
      {direction === "prev" && <Icon aria-hidden className="h-5 w-5 shrink-0" />}
      <span className="grid">
        <span className="text-xs text-text-1">{label}</span>
        <span className="font-mono text-sm font-medium">{verse}</span>
      </span>
      {direction === "next" && <Icon aria-hidden className="h-5 w-5 shrink-0" />}
    </Link>
  );
}

function ShlokaReading({
  locale,
  shloka,
  heading,
}: {
  locale: LibraryLocale;
  shloka: LibraryShlokaDto;
  heading: string;
}) {
  return (
    <div className="grid gap-5">
      {/* Оригинал необязателен (VED-464). */}
      {shloka.text && <ShlokaVerse text={shloka.text} />}

      {shloka.translation && (
        <section aria-labelledby="shloka-translation">
          <h2
            id="shloka-translation"
            className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-text-0"
          >
            {st(locale, "view.translation")}
          </h2>
          <p
            lang={shloka.contentLanguage}
            className="whitespace-pre-line text-[17px] font-semibold leading-8 text-text-0"
          >
            {shloka.translation}
          </p>
        </section>
      )}

      {shloka.wordByWord && (
        <ShlokaDisclosure title={st(locale, "view.wordByWord")}>
          <p
            lang={shloka.contentLanguage}
            className="whitespace-pre-line text-[15px] leading-7 text-text-0"
          >
            {shloka.wordByWord}
          </p>
        </ShlokaDisclosure>
      )}

      {shloka.commentary && (
        <ShlokaDisclosure title={st(locale, "view.commentary")}>
          <Paragraphs text={shloka.commentary} lang={shloka.contentLanguage} />
        </ShlokaDisclosure>
      )}

      {shloka.images.length > 0 && (
        <section aria-labelledby="shloka-images">
          <h2
            id="shloka-images"
            className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-text-0"
          >
            {st(locale, "view.images")}
          </h2>
          <ShlokaImages
            locale={locale}
            images={shloka.images}
            label={`${st(locale, "view.imageAlt")} ${heading}`}
          />
        </section>
      )}

      {shloka.acharyas.length > 0 && (
        <section aria-labelledby="shloka-acharyas" className="grid gap-4">
          <h2
            id="shloka-acharyas"
            className="font-display text-sm font-semibold uppercase tracking-wide text-text-0"
          >
            {st(locale, "view.acharyas")}
          </h2>
          {shloka.acharyas.map((block) => (
            <section
              key={block.id}
              aria-label={block.acharya}
              className="glass grid gap-4 rounded-2xl border border-glass-brd p-4"
            >
              <h3 className="font-display text-base font-semibold text-text-0">
                {block.acharya}
              </h3>
              {block.text && <ShlokaVerse text={block.text} size="md" />}
              {block.translation && (
                <p
                  lang={shloka.contentLanguage}
                  className="whitespace-pre-line text-[16px] font-semibold leading-7 text-text-0"
                >
                  {block.translation}
                </p>
              )}
              {block.wordByWord && (
                <ShlokaDisclosure title={st(locale, "view.wordByWord")} level={4}>
                  <p
                    lang={shloka.contentLanguage}
                    className="whitespace-pre-line text-[15px] leading-7 text-text-0"
                  >
                    {block.wordByWord}
                  </p>
                </ShlokaDisclosure>
              )}
              {block.commentary && (
                <ShlokaDisclosure title={st(locale, "view.commentary")} level={4}>
                  <Paragraphs text={block.commentary} lang={shloka.contentLanguage} />
                </ShlokaDisclosure>
              )}
              {block.images.length > 0 && (
                <ShlokaImages
                  locale={locale}
                  images={block.images}
                  label={`${st(locale, "view.imageAlt")} ${heading}, ${block.acharya}`}
                />
              )}
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

/** Абзацы — по пустым строкам; одиночный перевод строки остаётся внутри. */
function Paragraphs({ text, lang }: { text: string; lang: string }) {
  return (
    <div lang={lang} className="grid gap-3 break-words hyphens-auto text-[15px] leading-7 text-text-0">
      {text
        .split(/\n[ \t]*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}
