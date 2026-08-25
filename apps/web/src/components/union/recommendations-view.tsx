"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationCard } from "./recommendation-card";
import { RecommendationTile } from "./recommendation-tile";
import { SwipeDeck } from "./swipe-deck";

type ViewMode = "grid" | "swipe";

const MOBILE_QUERY = "(max-width: 767px)";

const mobileQuery = () => window.matchMedia(MOBILE_QUERY);

function subscribeToMobileQuery(onChange: () => void): () => void {
  const query = mobileQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Список или колода свайпов. На телефоне колода удобнее и включена по
 * умолчанию, на десктопе список даёт больше людей за экран.
 */
export function RecommendationsView({
  items,
}: {
  items: UnionRecommendation[];
}) {
  const isMobile = useSyncExternalStore(
    subscribeToMobileQuery,
    () => mobileQuery().matches,
    () => false,
  );
  const [modeOverride, setModeOverride] = useState<ViewMode | null>(null);
  // С какой анкеты открывать просмотр. Тап по плитке задаёт её позицию,
  // переключатель «Свайпами» начинает с начала.
  const [viewerIndex, setViewerIndex] = useState(0);
  const mode: ViewMode = modeOverride ?? (isMobile ? "swipe" : "grid");
  // На телефоне свайп — полноэкранный фокус-режим без обвязки страницы;
  // на десктопе тот же режим остаётся инлайн внутри обычной страницы.
  const focusMode = isMobile && mode === "swipe";

  useEffect(() => {
    if (!focusMode) return;
    window.history.pushState({ unionFocusMode: true }, "");
    const onPopState = () => setModeOverride("grid");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [focusMode]);

  function exitFocusMode() {
    // history.back() запускает popstate-обработчик выше, который и
    // переключает mode на "grid" — единая точка выхода что для клика,
    // что для системного «назад», без лишней записи в истории.
    window.history.back();
  }

  if (focusMode) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-bg-0 px-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
        }}
      >
        <div className="flex min-h-0 flex-1 justify-center">
          <SwipeDeck
            items={items}
            initialIndex={viewerIndex}
            fullscreen
            onExit={exitFocusMode}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <ModeButton
          active={mode === "grid"}
          onClick={() => setModeOverride("grid")}
        >
          Списком
        </ModeButton>
        <ModeButton
          active={mode === "swipe"}
          onClick={() => {
            setViewerIndex(0);
            setModeOverride("swipe");
          }}
        >
          Свайпами
        </ModeButton>
      </div>

      {mode === "swipe" ? (
        <SwipeDeck items={items} initialIndex={viewerIndex} />
      ) : isMobile ? (
        /*
          На телефоне список — плитками в две колонки: так за экран видно
          восемь человек вместо полутора, и список выполняет свою работу —
          быстро оглядеться. Подробности открываются тапом, в просмотре.
        */
        <div className="grid grid-cols-2 gap-2">
          {items.map((item, position) => (
            <RecommendationTile
              key={item.user.id}
              item={item}
              onOpen={() => {
                setViewerIndex(position);
                setModeOverride("swipe");
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <RecommendationCard key={item.user.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-magenta/40 bg-magenta/10 text-text-0"
          : "glass border-glass-brd text-text-1 hover:text-text-0"
      }`}
    >
      {children}
    </button>
  );
}
