"use client";

import { useState, useSyncExternalStore } from "react";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationCard } from "./recommendation-card";
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
  const mode: ViewMode = modeOverride ?? (isMobile ? "swipe" : "grid");

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
          onClick={() => setModeOverride("swipe")}
        >
          Свайпами
        </ModeButton>
      </div>

      {mode === "swipe" ? (
        <SwipeDeck items={items} />
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
