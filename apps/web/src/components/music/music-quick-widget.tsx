"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MusicQuickAccessData } from "@/lib/music-quick-access";
import { formatTotalDuration, formatTrackDuration } from "@/lib/music-duration";
import { getListenStats } from "@/lib/music-playback-api";
import { MusicCover } from "./music-cover";
import { useMusicPlayer } from "./player/player-provider";
import { useQueueTracks } from "./player/use-queue-tracks";

/**
 * Карточка Музыки на главной портала.
 * См. макеты `.design/music/Main.dc.html` и `.design/music/PortalWide.dc.html`.
 *
 * Одна карточка на два макета, а не два компонента: на широком экране вместо
 * ряда кнопок разворачиваются очередь, друзья и недельная сводка. Узкий экран
 * этот блок **не рисует вовсе** — не сворачивает в аккордеон, а не рисует:
 * очередь на телефоне живёт в полосе плеера, и второе место для неё на
 * главной означало бы два расходящихся списка.
 *
 * Смысл карточки — не заходя в сервис вернуться к тому, что не дослушал.
 * Поэтому кнопка пуска начинает с сохранённой позиции, а не с нуля: под
 * названием написано, сколько осталось, и начать с начала значило бы соврать
 * подписью.
 */
export function MusicQuickWidget({
  data,
  friends = [],
}: {
  data: MusicQuickAccessData;
  /**
   * Кто из друзей что слушает. Приходит пропсом с главной, а не запросом
   * отсюда: граф доступа принадлежит порталу, и компонент Музыки не имеет
   * права знать его эндпоинт.
   */
  friends?: MusicFriendListening[];
}) {
  const player = useMusicPlayer();
  const { resume, favoritesCount } = data;

  return (
    <section
      aria-label="Музыка"
      className="glass mb-4 rounded-2xl p-3 lg:rounded-[20px] lg:p-[18px]"
    >
      {/* Телефон и планшет: продолжить + кнопки. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {resume && (
          <>
            <div className="flex items-center gap-2.5">
              <Link
                href={`/music/tracks/${resume.trackId}`}
                aria-label={`Открыть запись: ${resume.title}`}
                className="size-13 shrink-0 overflow-hidden rounded-xl"
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

              {/* Пауза, а не только пуск. На главной портала полосы плеера
                  нет — она спрятана, чтобы две панели одного плеера не
                  спорили, — и эта кнопка остаётся единственной на экране
                  телефона. Если бы она всегда звала `play()`, играющую
                  запись здесь было бы нечем остановить, а нажатие
                  перезапускало бы её с сохранённой секунды. */}
              <button
                type="button"
                aria-label={
                  player?.isPlaying ? "Пауза" : `Продолжить запись: ${resume.title}`
                }
                disabled={!player}
                onClick={() => {
                  if (player?.current) player.toggle();
                  else
                    player?.play(
                      resume.trackId,
                      undefined,
                      resume.positionSeconds,
                    );
                }}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {player?.isPlaying ? (
                    <>
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </>
                  ) : (
                    <path d="M7 4l13 8-13 8z" />
                  )}
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

        <QuickChips favoritesCount={favoritesCount} />
      </div>

      {/* Широкий экран: играет сейчас, очередь, друзья. */}
      <div className="hidden lg:grid lg:grid-cols-[356px_1fr_300px] lg:gap-5">
        <NowPlayingColumn data={data} />
        <QueueColumn />
        <FriendsColumn friends={friends} />
      </div>
    </section>
  );
}

/** Что слушает друг. Ровно то, что уже приходит порталу по SSE. */
export interface MusicFriendListening {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string;
  link: string;
  addLink: string;
}

const chipClass =
  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-glass-brd bg-white/4 text-xs font-semibold text-text-1 transition-colors hover:text-text-0 sm:h-9";

function QuickChips({ favoritesCount }: { favoritesCount: number }) {
  return (
    <div className="flex gap-1.5">
      <Link href="/music/favorites" className={chipClass}>
        <HeartIcon className="size-3.5 text-magenta" />
        Избранное
        {favoritesCount > 0 && (
          <span className="font-mono text-[11px] text-text-2">
            {favoritesCount}
          </span>
        )}
      </Link>

      <Link href="/music/playlists" className={chipClass}>
        <QueueIcon className="size-3.5 text-gold" />
        Плейлисты
      </Link>

      <Link href="/music" className={chipClass}>
        <NoteIcon className="size-3.5 text-violet" />
        Каталог
      </Link>
    </div>
  );
}

/**
 * «Играет сейчас» на широком экране. Берёт запись из плеера, а когда он молчит
 * — из сохранённой позиции: карточка обязана предлагать продолжить и после
 * перезагрузки страницы, пока звук ещё не запущен.
 */
function NowPlayingColumn({ data }: { data: MusicQuickAccessData }) {
  const player = useMusicPlayer();
  const { resume } = data;
  const current = player?.current ?? null;

  const title = current?.title ?? resume?.title ?? null;
  const artistName = current?.artist?.name ?? resume?.artistName ?? null;
  const albumTitle = current?.album?.title ?? null;
  const coverUrl = current?.coverUrl ?? resume?.coverUrl ?? null;
  const seed = current?.id ?? resume?.trackId ?? "music";

  if (!title) {
    return (
      <div className="flex flex-col justify-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-violet">
          Музыка
        </span>
        <p className="text-sm text-text-1">
          Ничего не играет. Загляните в каталог — там киртаны, бхаджаны и записи
          с программ.
        </p>
        <Link href="/music" className="text-sm text-cyan hover:text-magenta">
          Открыть каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <Link
        href={`/music/tracks/${current?.id ?? resume?.trackId}`}
        aria-label={`Открыть запись: ${title}`}
        className="size-[132px] shrink-0 overflow-hidden rounded-2xl"
      >
        <MusicCover url={coverUrl} seed={seed} alt="" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-violet">
            {player?.isPlaying ? "Играет сейчас" : "Продолжить"}
          </span>
          <span className="truncate font-display text-lg font-bold text-text-0">
            {title}
          </span>
          <span className="truncate text-[13px] text-text-1">
            {artistName ?? "Исполнитель не указан"}
          </span>
          <span className="truncate text-xs text-text-2">
            {albumTitle ?? resume?.remainingLabel ?? ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Предыдущая запись"
            disabled={!player?.hasPrev}
            onClick={() => player?.prev()}
            className="flex size-8 items-center justify-center rounded-full text-text-1 hover:text-text-0 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 4L9 12l10 8z" />
              <path d="M5 5v14" />
            </svg>
          </button>

          <button
            type="button"
            aria-label={player?.isPlaying ? "Пауза" : `Слушать: ${title}`}
            disabled={!player}
            onClick={() => {
              if (player?.current) player.toggle();
              else if (resume)
                player?.play(resume.trackId, undefined, resume.positionSeconds);
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-mint-edge bg-mint text-on-mint disabled:opacity-40"
          >
            {player?.isPlaying ? (
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4l13 8-13 8z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            aria-label="Следующая запись"
            disabled={!player?.hasNext}
            onClick={() => player?.next()}
            className="flex size-8 items-center justify-center rounded-full text-text-1 hover:text-text-0 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 4l10 8-10 8z" />
              <path d="M19 5v14" />
            </svg>
          </button>

          <button
            type="button"
            aria-label={
              player?.isFavorite ? "Убрать из избранного" : "В избранное"
            }
            aria-pressed={player?.isFavorite ?? false}
            disabled={!player?.current}
            onClick={() => player?.toggleFavorite()}
            className={`flex size-8 items-center justify-center rounded-full disabled:opacity-40 ${
              player?.isFavorite ? "text-magenta" : "text-text-1"
            }`}
          >
            <HeartIcon className="size-4" />
          </button>

          {player?.isPrivateSession && (
            <span className="ml-auto flex h-7 items-center gap-1 rounded-full border border-glass-brd px-2.5 text-[11px] font-semibold text-text-1">
              <svg
                viewBox="0 0 24 24"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                <path d="M4 4l16 16" />
              </svg>
              Невидимо
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Четыре следующие записи. Больше не помещается, а «ещё» ведёт в очередь. */
const QUEUE_PREVIEW = 4;

function QueueColumn() {
  const player = useMusicPlayer();
  const queue = player?.queue ?? [];
  const index = player?.index ?? 0;
  const upcoming = queue.slice(index + 1, index + 1 + QUEUE_PREVIEW);
  const { tracks, missing } = useQueueTracks(upcoming);

  return (
    <div className="flex min-w-0 flex-col gap-2 border-l border-glass-brd pl-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold text-text-0">Дальше в очереди</h3>
        {queue.length > 0 && (
          <Link href="/music" className="text-xs text-cyan hover:text-magenta">
            Весь каталог
          </Link>
        )}
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-text-2">
          Дальше ничего нет. Запуск из каталога или плейлиста наберёт очередь
          сам.
        </p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {upcoming.map((id, at) => {
            const track = tracks[id];
            const gone = missing.has(id);
            return (
              <li key={`${id}-${at}`}>
                <button
                  type="button"
                  disabled={gone}
                  onClick={() => player?.play(id, queue)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-white/4 disabled:hover:bg-transparent"
                >
                  <span
                    aria-hidden="true"
                    className="w-3.5 shrink-0 font-mono text-[11px] text-text-2"
                  >
                    {at + 1}
                  </span>
                  <MusicCover
                    url={track?.coverUrl ?? null}
                    seed={id}
                    alt=""
                    className="size-[30px] shrink-0"
                    rounded="rounded-lg"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold text-text-0">
                      {gone ? "Запись недоступна" : (track?.title ?? "…")}
                    </span>
                    <span className="truncate text-[11px] text-text-2">
                      {gone
                        ? "Её убрали из каталога"
                        : (track?.artist?.name ?? "")}
                    </span>
                  </span>
                  {track && (
                    <span className="shrink-0 font-mono text-[11px] text-text-2">
                      {formatTrackDuration(track.durationSeconds)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Друзья и недельная сводка.
 *
 * Сводка считается по истории и запрашивается один раз при монтировании:
 * это число за неделю, оно не меняется на глазах, и обновлять его тиком
 * плеера значило бы ходить в базу за агрегатом каждые полминуты.
 */
function FriendsColumn({ friends }: { friends: MusicFriendListening[] }) {
  const [weekSeconds, setWeekSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getListenStats().then((stats) => {
      if (!cancelled && stats) setWeekSeconds(stats.weekSeconds);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2.5 border-l border-glass-brd pl-5">
      <h3 className="text-[13px] font-bold text-text-0">Слушают друзья</h3>

      {friends.length === 0 ? (
        <p className="text-xs text-text-2">
          Сейчас никто из ваших не слушает.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {friends.slice(0, 3).map((friend) => (
            <li key={friend.id} className="flex items-center gap-2">
              {friend.avatarUrl ? (
                // Ссылка подписана и может истечь — next/image не годится для
                // произвольно меняющегося домена подписи.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={friend.avatarUrl}
                  alt=""
                  className="size-[30px] shrink-0 rounded-[10px] object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-magenta to-cyan text-xs font-bold text-bg-0"
                >
                  {friend.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <Link
                href={friend.link}
                className="flex min-w-0 flex-1 flex-col text-text-1 hover:text-text-0"
              >
                <span className="truncate text-xs font-semibold">
                  {friend.name}
                </span>
                <span className="truncate text-[11px] text-text-2">
                  {friend.title}
                </span>
              </Link>
              <Link
                href={friend.addLink}
                title="В плейлист"
                aria-label={`В плейлист: ${friend.title}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-[9px] border border-violet/40 bg-violet/12 text-violet"
              >
                <QueueIcon className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {weekSeconds !== null && weekSeconds > 0 && (
        <p className="mt-auto flex items-baseline gap-1.5 border-t border-glass-brd pt-2.5">
          <span className="font-mono text-[22px] font-medium text-cyan">
            {formatTotalDuration(weekSeconds)}
          </span>
          <span className="text-xs text-text-2">наслушано за неделю</span>
        </p>
      )}
    </div>
  );
}

function HeartIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
    </svg>
  );
}

function QueueIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
    </svg>
  );
}

function NoteIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
  );
}
