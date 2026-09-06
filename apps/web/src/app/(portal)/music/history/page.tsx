import type { Metadata } from "next";
import { MusicRail } from "@/components/music/music-rail";
import { MusicTrackRow } from "@/components/music/music-track-row";
import { MusicPlayAllButton } from "@/components/music/player/play-all-button";
import { formatListenedAt } from "@/lib/music-listened-at";
import { getMusicHistory } from "@/lib/music-api";

export const metadata: Metadata = {
  title: "История",
  robots: { index: false, follow: false },
};

/**
 * История прослушиваний.
 *
 * Строкой, а не карточкой: здесь важны время и порядок, а не обложка —
 * человек приходит сюда за «что это играло вчера вечером», и сетка плиток
 * на такой вопрос не отвечает.
 *
 * Хранится 90 дней, дальше строки уносит ретеншен. Про срок сказано прямо:
 * молча пропавшая позавчерашняя запись читается как поломка.
 */
export default async function MusicHistoryPage() {
  const history = await getMusicHistory().catch(() => null);
  const items = history?.items ?? [];
  const queue = items.map((item) => item.track.id);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10 lg:flex-row">
      <MusicRail active="history" />

      <div className="min-w-0 flex-1">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-0 md:text-3xl">
            История
          </h1>
          <p className="text-sm text-text-2">
            Что вы слушали. Хранится три месяца, дальше — стирается
          </p>
        </header>

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-text-1">
            Пока пусто. Запись попадает сюда, когда её послушали хотя бы
            полминуты.
          </p>
        ) : (
          <>
            <div className="mt-6">
              <MusicPlayAllButton queue={queue} label="Слушать заново" />
            </div>

            <ul className="mt-4 flex flex-col">
              {items.map((item) => (
                <li
                  key={`${item.track.id}-${item.listenedAt}`}
                  className="flex items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <MusicTrackRow track={item.track} queue={queue} />
                  </span>
                  <time
                    dateTime={item.listenedAt}
                    className="shrink-0 font-mono text-[11px] text-text-2"
                  >
                    {formatListenedAt(item.listenedAt)}
                  </time>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
