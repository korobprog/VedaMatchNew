"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { UnionRecommendation } from "@vedamatch/shared";
import {
  DEFAULT_DENSITY,
  DENSITY_STORAGE_KEY,
  densityClassName,
  densityLabel,
  nextDensity,
  parseDensity,
  type GridDensity,
} from "./grid-density";
import { RecommendationCard } from "./recommendation-card";
import { RecommendationTile } from "./recommendation-tile";
import { SwipeDeck } from "./swipe-deck";

type ViewMode = "grid" | "swipe";

const MOBILE_QUERY = "(max-width: 767px)";

const mobileQuery = () => window.matchMedia(MOBILE_QUERY);

function readDensity(): string | null {
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

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
  const [density, setDensity] = useState<GridDensity>(DEFAULT_DENSITY);
  const mode: ViewMode = modeOverride ?? (isMobile ? "swipe" : "grid");
  // На телефоне свайп — полноэкранный фокус-режим без обвязки страницы;
  // на десктопе тот же режим остаётся инлайн внутри обычной страницы.
  const focusMode = isMobile && mode === "swipe";

  useEffect(() => {
    // Синхронного способа прочитать localStorage к первому рендеру нет, а
    // на сервере его нет вовсе — это тот случай, ради которого нужен эффект.
    // Тот же приём у возрастного фильтра и у темы.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDensity(parseDensity(readDensity()));
  }, []);

  function chooseDensity(value: GridDensity) {
    setDensity(value);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, String(value));
    } catch {
      // Приватный режим — выбор всё равно работает в рамках сессии.
    }
  }

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

        {/* Плотность — выбор человека, а не наше решение за него: две
            колонки дают крупные лица, три — вдвое больше людей за экран.
            Кнопка одна и переключает по кругу, подпись обещает результат
            нажатия. Только в списке на телефоне: на десктопе места хватает,
            а в колоде плотности нет вовсе. */}
        {isMobile && mode === "grid" && (
          <button
            type="button"
            onClick={() => chooseDensity(nextDensity(density))}
            className="glass ml-auto rounded-xl border border-glass-brd px-3 py-2 text-xs font-medium text-text-1 transition hover:text-text-0"
          >
            {densityLabel(density)}
          </button>
        )}
      </div>

      {mode === "swipe" ? (
        <SwipeDeck items={items} initialIndex={viewerIndex} />
      ) : isMobile ? (
        /*
          На телефоне список — плитками в две колонки: так за экран видно
          восемь человек вместо полутора, и список выполняет свою работу —
          быстро оглядеться. Подробности открываются тапом, в просмотре.
        */
        <div className={densityClassName(density)}>
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
