"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  isNowPlayingMessage,
  type ActivityFeedItem,
  type ActivityFeedResponse,
  type ActivityFriendRow,
  type ActivityNowPlayingDto,
  type ActivityStreamMessage,
} from "@vedamatch/shared";
import { subscribeToActivity } from "@/lib/activity-stream";
import { formatActivityTime } from "./activity-time";
import { AdminBadgeIcon, STAGE_LABEL, STAGE_TINT, StageIcon } from "./activity-icons";

const MAX_ROWS = 8;
const MAX_ITEMS_PER_FRIEND = 6;
const FRESH_ROW_MS = 1200;

const ACTION_META: Record<string, { glyph: string; className: string }> = {
  "motivation.favorite-added": { glyph: "✦", className: "bg-magenta/15 text-magenta" },
  "library.entry-created": { glyph: "▤", className: "bg-gold/15 text-gold" },
  "market.listing-created": { glyph: "▢", className: "bg-cyan/15 text-cyan" },
  "market.listing-favorited": { glyph: "♡", className: "bg-cyan/15 text-cyan" },
  "notices.notice-created": { glyph: "▣", className: "bg-blue/15 text-blue" },
  "music.track-favorited": { glyph: "♪", className: "bg-violet/15 text-violet" },
  "music.playlist-published": { glyph: "▤", className: "bg-violet/15 text-violet" },
};

const SOURCE_META: Record<"union" | "contacts", { glyph: string; label: string }> = {
  union: { glyph: "💞", label: "Взаимный мэтч в Знакомствах" },
  contacts: { glyph: "🤝", label: "Открыт доступ в Справочнике" },
};

/**
 * Живая лента друзей: строка на друга, у которого открыт доступ (мэтч в
 * Знакомствах или раскрытые контакты в Справочнике), полоса его последних
 * действий бежит непрерывно. Начальный список приходит с сервера, дальше
 * ведёт SSE — новое действие поднимает строку наверх и подсвечивает её на
 * миг, без перезагрузки страницы. Пусто у человека без открытых доступов —
 * тогда виджет не рендерится вовсе.
 */
export function FriendsActivityWidget({
  initialFeed,
}: {
  initialFeed: ActivityFeedResponse;
}) {
  const [rows, setRows] = useState<ActivityFriendRow[]>(initialFeed.friends);
  // «Слушает сейчас» живёт отдельно от карточек: это не запись в ленте, а
  // состояние, которое гаснет само. В `rows` его класть нельзя — там
  // постоянные действия, и «слушает» вытеснило бы их из полосы.
  const [nowPlaying, setNowPlaying] = useState<
    Record<string, ActivityNowPlayingDto | null>
  >({});
  const [freshFriendId, setFreshFriendId] = useState<string | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToActivity((message: ActivityStreamMessage) => {
      if (isNowPlayingMessage(message)) {
        setNowPlaying((was) => ({
          ...was,
          [message.friend.id]: message.nowPlaying,
        }));
        // Друг может слушать, ничего до этого не сделав: тогда строки в
        // ленте ещё нет, и её надо завести — иначе живого «слушает» не
        // увидит никто.
        setRows((prev) =>
          prev.some((row) => row.friend.id === message.friend.id) ||
          !message.nowPlaying
            ? prev
            : [
                {
                  friend: message.friend,
                  items: [],
                  lastActivityAt: new Date().toISOString(),
                },
                ...prev,
              ].slice(0, MAX_ROWS),
        );
        return;
      }

      const event = message;
      setRows((prev) => {
        const existing = prev.find((row) => row.friend.id === event.friend.id);
        const items = [event.item, ...(existing?.items ?? [])].slice(
          0,
          MAX_ITEMS_PER_FRIEND,
        );
        const nextRow: ActivityFriendRow = {
          friend: event.friend,
          items,
          lastActivityAt: event.item.occurredAt,
        };
        const rest = prev.filter((row) => row.friend.id !== event.friend.id);
        return [nextRow, ...rest].slice(0, MAX_ROWS);
      });

      setFreshFriendId(event.friend.id);
      if (freshTimer.current) clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => setFreshFriendId(null), FRESH_ROW_MS);
    });

    return () => {
      unsubscribe();
      if (freshTimer.current) clearTimeout(freshTimer.current);
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 border-t border-glass-brd pt-6">
      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
        Лента друзей
      </h2>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <FriendRow
            key={row.friend.id}
            row={row}
            nowPlaying={nowPlaying[row.friend.id] ?? null}
            isFresh={row.friend.id === freshFriendId}
          />
        ))}
      </div>
    </section>
  );
}

function FriendRow({
  row,
  nowPlaying,
  isFresh,
}: {
  row: ActivityFriendRow;
  nowPlaying: ActivityNowPlayingDto | null;
  isFresh: boolean;
}) {
  const { friend, items } = row;
  const letter = friend.name.trim().charAt(0).toUpperCase() || "?";
  // Чем длиннее полоса, тем медленнее бег — иначе короткие строки листаются
  // слишком резко, а длинные не успевают дочитаться за один проход.
  const speed = Math.max(14, items.length * 7);
  const marquee = items.length > 1;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border border-glass-brd bg-glass p-2 sm:gap-3 sm:p-2.5 ${
        isFresh ? "activity-row-fresh" : ""
      }`}
    >
      <Link
        href={`/chat/with/${friend.id}`}
        title={`Написать «${friend.name}»`}
        className="relative shrink-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
      >
        {friend.avatarUrl ? (
          // Ссылка подписана и может истечь — next/image не годится для
          // произвольно меняющегося домена подписи, как и в аватаре чата.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={friend.avatarUrl}
            alt=""
            className="size-9 rounded-xl object-cover sm:size-10"
          />
        ) : (
          <span
            className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-magenta to-cyan font-display text-sm font-semibold text-bg-0 sm:size-10"
            aria-hidden
          >
            {letter}
          </span>
        )}
        {friend.isAdmin && (
          <span
            title="Администратор портала"
            className="absolute -left-1 -top-1 flex size-4 items-center justify-center rounded-full border-2 border-bg-0 bg-bg-1 text-gold"
          >
            <AdminBadgeIcon />
          </span>
        )}
        <span
          title={SOURCE_META[friend.source].label}
          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border-2 border-bg-0 bg-bg-1 text-[9px] leading-none"
        >
          {SOURCE_META[friend.source].glyph}
        </span>
        {friend.isOnline && (
          <span
            title="В сети"
            className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg-0 bg-cyan"
          />
        )}
      </Link>

      <div className="w-16 min-w-0 shrink-0 sm:w-28">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold text-text-0">
            {friend.name}
          </span>
          {friend.spiritualStage && (
            <span
              title={STAGE_LABEL[friend.spiritualStage]}
              className={`size-3.5 shrink-0 ${STAGE_TINT[friend.spiritualStage]}`}
            >
              <StageIcon stage={friend.spiritualStage} />
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-text-2">
          {formatActivityTime(row.lastActivityAt)}
        </div>
      </div>

      {nowPlaying ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href={nowPlaying.link}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-text-1 hover:text-text-0"
          >
            <span
              aria-hidden
              className="flex size-[17px] shrink-0 items-center justify-center rounded-md bg-violet/15 text-[10px] text-violet"
            >
              ♪
            </span>
            <span className="truncate">
              слушает «{nowPlaying.title}»
            </span>
          </Link>
          {/* Обычная ссылка, а не общая модалка: этот компонент портальный, и
              импортировать компоненты Музыки ему нельзя. Адрес приезжает
              готовым в самом событии. */}
          <Link
            href={nowPlaying.addLink}
            title="В плейлист"
            aria-label={`В плейлист: ${nowPlaying.title}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-violet/40 bg-violet/12 text-violet"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 6h11M3 12h8M3 18h8M17 12v8M13 16h8" />
            </svg>
          </Link>
        </div>
      ) : items.length === 0 ? null : (
      <div
        className="min-w-0 flex-1 overflow-hidden py-0.5"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
        }}
      >
        {marquee ? (
          <div
            className="activity-marquee-track flex w-max items-center gap-2"
            style={
              { "--activity-marquee-duration": `${speed}s` } as React.CSSProperties
            }
          >
            {items.map((item) => (
              <ActivityChip key={item.id} item={item} />
            ))}
            <div aria-hidden className="flex items-center gap-2">
              {items.map((item) => (
                <ActivityChip key={`dup-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center">
            <ActivityChip item={items[0]} />
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function ActivityChip({ item }: { item: ActivityFeedItem }) {
  const meta = ACTION_META[item.action] ?? { glyph: "•", className: "bg-glass text-text-1" };
  const chip = (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-glass-brd bg-bg-1 px-2.5 py-1.5 text-xs text-text-1">
      <span
        aria-hidden
        className={`flex size-[17px] shrink-0 items-center justify-center rounded-md text-[10px] ${meta.className}`}
      >
        {meta.glyph}
      </span>
      <span className="text-text-0">{item.title}</span>
      <span className="font-mono text-[10.5px] text-text-2">
        {formatActivityTime(item.occurredAt)}
      </span>
    </span>
  );
  return item.link ? (
    <Link href={item.link} className="shrink-0">
      {chip}
    </Link>
  ) : (
    chip
  );
}
