"use client";

import Link from "next/link";
import type { MusicQuickAccessData } from "@/lib/music-quick-access";
import { MusicCover } from "./music-cover";
import { useMusicPlayer } from "./player/player-provider";

/**
 * Карточка быстрых действий Музыки на главной портала.
 * См. макет `.design/music/Main.dc.html`.
 *
 * Смысл — не заходя в сервис вернуться к тому, что не дослушал. Поэтому
 * кнопка пуска начинает с сохранённой позиции, а не с нуля: под названием
 * написано, сколько осталось, и начать с начала значило бы соврать подписью.
 *
 * Чипов два, а не три как в макете. «Утренний киртан» вёл бы на страницу
 * подборки, которой нет до этапа 4, а «Друзья» — на музыкальные карточки
 * ленты, которых нет до этапа 6. Ссылка в никуда хуже её отсутствия; тот же
 * счёт, что у неактивных пунктов рельса и у плитки подборки.
 */
export function MusicQuickWidget({ data }: { data: MusicQuickAccessData }) {
  const player = useMusicPlayer();
  const { resume, favoritesCount } = data;

  const chip =
    "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-glass-brd bg-white/4 text-xs font-semibold text-text-1 transition-colors hover:text-text-0 sm:h-9";

  return (
    <section
      aria-label="Музыка"
      className="glass mb-4 flex flex-col gap-3 rounded-2xl p-3"
    >
      {resume && (
        <>
          <div className="flex items-center gap-2.5">
            <Link
              href={`/music/tracks/${resume.trackId}`}
              aria-label={`Открыть запись: ${resume.title}`}
              className="h-13 w-13 shrink-0 overflow-hidden rounded-xl"
              style={{ height: 52, width: 52 }}
            >
              <MusicCover
                url={resume.coverUrl}
                seed={resume.trackId}
                alt=""
                rounded="rounded-xl"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-violet">
                Продолжить
              </span>
              <span className="truncate text-sm font-semibold text-text-0">
                {resume.title}
              </span>
              <span className="truncate text-xs text-text-2">
                {[resume.artistName, resume.remainingLabel]
                  .filter(Boolean)
                  .join(" · ") || "Исполнитель не указан"}
              </span>
            </div>

            <button
              type="button"
              aria-label={`Продолжить запись: ${resume.title}`}
              disabled={!player}
              onClick={() =>
                player?.play(resume.trackId, undefined, resume.positionSeconds)
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4l13 8-13 8z" />
              </svg>
            </button>
          </div>

          {/* Полоса декоративна: то же самое сказано словами в «осталось …». */}
          <div
            aria-hidden="true"
            className="h-[3px] overflow-hidden rounded-full bg-glass-brd"
          >
            <div
              className="h-full rounded-full bg-violet"
              style={{ width: `${resume.percent}%` }}
            />
          </div>
        </>
      )}

      <div className="flex gap-1.5">
        <Link href="/music/favorites" className={chip}>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-magenta"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
          </svg>
          Избранное
          {favoritesCount > 0 && (
            <span className="font-mono text-[11px] text-text-2">
              {favoritesCount}
            </span>
          )}
        </Link>

        <Link href="/music" className={chip}>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-violet"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          Каталог
        </Link>
      </div>
    </section>
  );
}
