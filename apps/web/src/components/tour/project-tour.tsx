"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Radio,
  Smartphone,
} from "lucide-react";
import {
  TOUR_WATCHED_KEY,
  parseTourWatched,
  tourChapterIndex,
  type TourChapter,
} from "@/lib/tour";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { TourShare } from "./tour-share";
import { TourVideoPlayer } from "./tour-video";

/**
 * «Познакомиться с проектом» (VED-651): главы слева, текущая справа —
 * видео-презентация, текст и «Попробовать». Глава живёт в якоре адреса,
 * поэтому ссылку на конкретную главу можно переслать. Просмотренные
 * отмечаются галочкой в этом браузере — удобство, а не учёт.
 */
export function ProjectTour({ chapters }: { chapters: TourChapter[] }) {
  const [index, setIndex] = useState(0);
  const [watched, setWatched] = useState<string[]>([]);

  useEffect(() => {
    // Вложенной функцией: якорь и localStorage есть только в браузере.
    function restore() {
      setIndex(tourChapterIndex(window.location.hash, chapters));
      try {
        setWatched(
          parseTourWatched(
            window.localStorage.getItem(TOUR_WATCHED_KEY),
            chapters,
          ),
        );
      } catch {
        // Хранилище закрыто (приватный режим) — просто без галочек.
      }
    }
    restore();
  }, [chapters]);

  const chapter = chapters[index];

  function open(next: number) {
    setIndex(next);
    window.history.replaceState(null, "", `#${chapters[next].id}`);
  }

  function markWatched(id: string) {
    setWatched((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      try {
        window.localStorage.setItem(TOUR_WATCHED_KEY, JSON.stringify(next));
      } catch {
        // Не сохранилось — галочка останется до перезагрузки.
      }
      return next;
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 sm:px-6">
      <header className="flex flex-col gap-4">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan">
          <Clapperboard aria-hidden className="size-4" />
          Туториал · {chapters.length}{" "}
          {plural(chapters.length, "глава", "главы", "глав")}
        </p>
        <h1 className="font-display text-3xl font-bold text-text-0 sm:text-4xl md:text-5xl">
          Познакомьтесь с VedaMatch
        </h1>
        <p className="max-w-2xl text-lg text-text-1">
          Короткие видео-презентации: что есть на портале и как этим
          пользоваться. Смотрите по порядку или сразу нужную главу — вход не
          нужен.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <nav aria-label="Главы туториала" className="lg:col-span-4">
          <ol className="glass flex flex-col gap-1 rounded-3xl border border-glass-brd p-2">
            {chapters.map((item, i) => {
              const done = watched.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open(i)}
                    aria-current={i === index ? "step" : undefined}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                      i === index
                        ? "bg-bg-2 text-text-0"
                        : "text-text-1 hover:bg-glass hover:text-text-0",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold",
                        i === index
                          ? "bg-gradient-to-r from-magenta to-[#B23EFF] text-white"
                          : "border border-glass-brd",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-grow text-sm font-semibold">
                      {item.title}
                    </span>
                    {done && (
                      <CheckCircle2
                        aria-label="Просмотрено"
                        className="size-4 shrink-0 text-cyan"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <article
          aria-labelledby="tour-chapter"
          className="flex flex-col gap-5 lg:col-span-8"
        >
          <TourVideoPlayer
            key={chapter.id}
            video={chapter.video}
            title={chapter.title}
            onEnded={() => {
              // Досмотрел — галочка и следующая глава (VED-653).
              markWatched(chapter.id);
              if (index < chapters.length - 1) open(index + 1);
            }}
          />
          {chapter.promo && (
            <div className="glass flex flex-col gap-4 rounded-3xl border border-glass-brd p-5 sm:p-6">
              <p className="text-base leading-relaxed text-text-0">
                {chapter.promo.text}
              </p>
              <TourShare
                chapterId={chapter.id}
                title={`${chapter.title} — VedaMatch`}
                text={chapter.promo.share}
              />
            </div>
          )}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-magenta">
              Глава {index + 1} из {chapters.length}
            </span>
            <h2
              id="tour-chapter"
              className="font-display text-2xl font-bold text-text-0 sm:text-3xl"
            >
              {chapter.title}
            </h2>
            <p className="max-w-2xl text-text-1">{chapter.text}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={chapter.cta.href}
              className="inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              {chapter.cta.label}
            </Link>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => open(index - 1)}
                disabled={index === 0}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-glass-brd px-4 text-sm text-text-0 hover:border-cyan/60 disabled:opacity-40"
              >
                <ArrowLeft aria-hidden className="size-4" />
                Предыдущая
              </button>
              <button
                type="button"
                onClick={() => open(index + 1)}
                disabled={index === chapters.length - 1}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-glass-brd px-4 text-sm text-text-0 hover:border-cyan/60 disabled:opacity-40"
              >
                Следующая
                <ArrowRight aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        </article>
      </div>

      <section
        aria-labelledby="tour-next"
        className="glass flex flex-col gap-4 rounded-3xl border border-glass-brd p-6 sm:flex-row sm:items-center"
      >
        <div className="flex flex-grow flex-col gap-1">
          <h2
            id="tour-next"
            className="font-display text-xl font-bold text-text-0"
          >
            Попробуйте сами
          </h2>
          <p className="text-sm text-text-1">
            Включите радио без входа или поставьте приложение на телефон.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/radio"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 font-semibold text-text-0 hover:border-cyan/60"
          >
            <Radio aria-hidden className="size-4" />
            Радио
          </Link>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 font-semibold text-text-0 hover:border-cyan/60"
          >
            <Smartphone aria-hidden className="size-4" />
            Приложение
          </Link>
        </div>
      </section>
    </div>
  );
}
