"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import type { UnionRecommendation } from "@vedamatch/shared";
import { ActivityBadge } from "./activity-badge";
import { intentionLabels, yearsSuffix } from "./labels";
import { PhotoVerifiedBadge, VerifiedBadge } from "./verified-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SWIPE_DISTANCE = 110;

const stageLabels: Record<string, string> = {
  seeker: "Ищущий",
  practitioner: "Практикующий основы",
  yogi: "Йог",
  devotee: "Преданный",
};

/**
 * Режим быстрого просмотра: одна карточка на экран, свайп вправо — запрос на
 * знакомство, влево — пропустить. Пропуск живёт только в этой сессии: отдельного
 * хранилища отказов пока нет, при перезагрузке человек снова появится в колоде.
 */
export function SwipeDeck({ items }: { items: UnionRecommendation[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const current = items[index];

  async function like(userId: string) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/union/connection-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: userId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent("Запрос отправлен");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить запрос");
    }
  }

  function advance() {
    setSent(null);
    setIndex((value) => value + 1);
  }

  if (!current) {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center">
        <p className="mb-2 font-display text-lg font-bold text-text-0">
          Колода закончилась
        </p>
        <p className="text-sm text-text-1">
          Вы просмотрели всех, кто подходит по текущим фильтрам. Расширьте
          условия поиска или загляните позже.
        </p>
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="mt-4 rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0"
        >
          Пройти заново
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-3 text-center text-sm text-text-2">
        {index + 1} из {items.length}
      </p>

      <div className="relative h-[520px]">
        <AnimatePresence initial={false}>
          <SwipeCard
            key={current.user.id}
            item={current}
            onLike={() => {
              void like(current.user.id);
              advance();
            }}
            onSkip={advance}
          />
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={advance}
          aria-label="Пропустить"
          className="flex h-14 w-14 items-center justify-center rounded-full glass border border-glass-brd text-2xl text-text-1 transition hover:text-text-0"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => {
            void like(current.user.id);
            advance();
          }}
          aria-label="Познакомиться"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] text-2xl text-white shadow-[0_0_24px_var(--vm-glow-magenta)]"
        >
          ♥
        </button>
      </div>

      {sent && <p className="mt-3 text-center text-sm text-cyan">{sent}</p>}
      {error && (
        <p className="mt-3 text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

function SwipeCard({
  item,
  onLike,
  onSkip,
}: {
  item: UnionRecommendation;
  onLike: () => void;
  onSkip: () => void;
}) {
  const { user, profile, compatibility } = item;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const skipOpacity = useTransform(x, [-140, -40], [1, 0]);

  const subtitle =
    [
      user.age != null ? `${user.age} ${yearsSuffix(user.age)}` : null,
      user.city,
      user.spiritualStage ? stageLabels[user.spiritualStage] : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <motion.article
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_event, info) => {
        if (info.offset.x > SWIPE_DISTANCE) onLike();
        else if (info.offset.x < -SWIPE_DISTANCE) onSkip();
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass absolute inset-0 flex touch-pan-y flex-col overflow-hidden rounded-3xl border border-glass-brd"
      data-testid="swipe-card"
    >
      <div className="relative flex-1 overflow-hidden bg-bg-2">
        {user.photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photos[0].url}
            alt={user.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-7xl font-bold text-text-0">
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}

        <motion.span
          style={{ opacity: likeOpacity }}
          className="absolute left-4 top-4 rounded-xl border-2 border-cyan px-3 py-1 font-display text-lg font-bold text-cyan"
        >
          ЗНАКОМИМСЯ
        </motion.span>
        <motion.span
          style={{ opacity: skipOpacity }}
          className="absolute right-4 top-4 rounded-xl border-2 border-text-2 px-3 py-1 font-display text-lg font-bold text-text-2"
        >
          ПРОПУСК
        </motion.span>

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
          <span className="rounded-full bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-1 text-sm font-bold text-white">
            {compatibility.total}%
          </span>
          {user.isVerifiedDevotee && <VerifiedBadge variant="overlay" />}
          {user.isPhotoVerified && <PhotoVerifiedBadge variant="overlay" />}
        </div>

        <div className="absolute left-3 bottom-20">
          <ActivityBadge activity={user.activity} variant="overlay" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <Link
            href={`/union/users/${user.id}`}
            className="block truncate font-display text-xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          >
            {user.name}
          </Link>
          <p className="truncate text-sm text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {profile.intentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.intentions.slice(0, 3).map((intention) => (
              <span
                key={intention.type}
                className="rounded-full border border-glass-brd bg-bg-1 px-2.5 py-1 text-xs text-text-1"
              >
                {intentionLabels[intention.type]} {intention.weight}%
              </span>
            ))}
          </div>
        )}
        {profile.about && (
          <p className="line-clamp-2 text-sm text-text-1">{profile.about}</p>
        )}
      </div>
    </motion.article>
  );
}
