"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import type { UnionRecommendation } from "@vedamatch/shared";
import { ActivityBadge } from "./activity-badge";
import { ProfileDetailsList } from "./profile-details-list";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";
import { UnionBoostButton } from "./union-boost-button";
import { unionInterestIcon } from "./dictionaries";
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
 * Режим быстрого просмотра: одна карточка на экран, свайп вправо — интерес,
 * влево — пропустить. Каждое решение уходит на сервер, поэтому отсмотренные
 * анкеты не возвращаются в колоду после перезагрузки.
 */
export function SwipeDeck({ items }: { items: UnionRecommendation[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const current = items[index];

  async function swipe(
    userId: string,
    decision: "like" | "superlike" | "pass",
  ) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/union/swipes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: userId, decision }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { matched?: boolean };
      setCanUndo(true);
      if (decision !== "pass") {
        setSent(
          result.matched
            ? "Взаимно! Чат открыт"
            : decision === "superlike"
              ? "Суперлайк отправлен"
              : "Запрос отправлен",
        );
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить выбор");
    }
  }

  /** Возврат последней анкеты: сервер снимает решение, колода отматывается назад. */
  async function undo() {
    if (index === 0 || undoing) return;
    setUndoing(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/union/swipes/last`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(null);
      setCanUndo(false);
      setIndex((value) => Math.max(0, value - 1));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось вернуть анкету");
    } finally {
      setUndoing(false);
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
              void swipe(current.user.id, "like");
              advance();
            }}
            onSkip={() => {
              void swipe(current.user.id, "pass");
              advance();
            }}
            onSuperlike={() => {
              void swipe(current.user.id, "superlike");
              advance();
            }}
          />
        </AnimatePresence>

        <button
          type="button"
          onClick={() => void undo()}
          disabled={!canUndo || index === 0 || undoing}
          aria-label="Вернуть предыдущую анкету"
          className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-40"
        >
          ↺
        </button>

        <UnionBoostButton />
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => {
            void swipe(current.user.id, "pass");
            advance();
          }}
          aria-label="Пропустить"
          className="flex h-14 w-14 items-center justify-center rounded-full glass border border-glass-brd text-2xl text-text-1 transition hover:text-text-0"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => {
            void swipe(current.user.id, "superlike");
            advance();
          }}
          aria-label="Суперлайк"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-[#B23EFF] to-[#5B3EFF] text-2xl text-white shadow-[0_0_24px_rgba(178,62,255,0.45)]"
        >
          🔥
        </button>
        <button
          type="button"
          onClick={() => {
            void swipe(current.user.id, "like");
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
  onSuperlike,
}: {
  item: UnionRecommendation;
  onLike: () => void;
  onSkip: () => void;
  onSuperlike: () => void;
}) {
  const { user, profile, compatibility } = item;
  const [expanded, setExpanded] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const superOpacity = useTransform(y, [-140, -40], [1, 0]);
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
      style={{ x, y, rotate }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.6}
      onDragEnd={(_event, info) => {
        if (info.offset.y < -SWIPE_DISTANCE) onSuperlike();
        else if (info.offset.x > SWIPE_DISTANCE) onLike();
        else if (info.offset.x < -SWIPE_DISTANCE) onSkip();
      }}
      // Перетаскивание карточки перехватывает указатель, поэтому вложенным
      // кнопкам и ссылкам (карусель, шеврон, имя) отдаём событие как есть.
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) {
          event.stopPropagation();
        }
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass absolute inset-0 flex touch-pan-y flex-col overflow-hidden rounded-3xl border border-glass-brd"
      data-testid="swipe-card"
    >
      <div className="relative flex-1 overflow-hidden bg-bg-2">
        {user.photos.length > 0 ? (
          <RecommendationPhotoCarousel
            photos={user.photos}
            userName={user.name}
            variant="cover"
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
          style={{ opacity: superOpacity }}
          className="absolute inset-x-0 top-16 text-center font-display text-lg font-bold text-[#C88BFF]"
        >
          СУПЕРЛАЙК
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
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
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
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-label={expanded ? "Свернуть анкету" : "Развернуть анкету"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-lg text-white backdrop-blur transition hover:bg-black/60"
            >
              <span aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
            </button>
          </div>

          {profile.interests.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-white/80">
                ✨ Интересы
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests
                  .slice(0, expanded ? profile.interests.length : 3)
                  .map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white backdrop-blur"
                    >
                      {unionInterestIcon(interest)} {interest}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="max-h-56 space-y-2 overflow-y-auto p-4">
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
            <p className="text-sm text-text-1">{profile.about}</p>
          )}
          <ProfileDetailsList details={profile} />
        </div>
      )}
    </motion.article>
  );
}
