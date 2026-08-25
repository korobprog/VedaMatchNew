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
  total,
}: {
  items: UnionRecommendation[];
  /** Сколько нашлось всего. Стоит в одном ряду с кнопками режима: отдельной
   *  строкой это съедало высоту, которой на телефоне и так не хватает. */
  total?: number;
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
      <div className="mb-4 flex items-center gap-2">
        <IconButton
          icon={<GridGlyph />}
          label="Списком"
          active={mode === "grid"}
          onClick={() => setModeOverride("grid")}
        />
        <IconButton
          icon={<DeckGlyph />}
          label="Свайпами"
          active={mode === "swipe"}
          onClick={() => {
            setViewerIndex(0);
            setModeOverride("swipe");
          }}
        />

        {/* Плотность — выбор человека, а не наше решение за него: две
            колонки дают крупные лица, три — вдвое больше людей за экран.
            Кнопка одна и переключает по кругу, подпись обещает результат
            нажатия. Только в списке на телефоне: на десктопе места хватает,
            а в колоде плотности нет вовсе. */}
        {total !== undefined && (
          <span className="ml-auto text-sm text-text-2">Найдено: {total}</span>
        )}

        {isMobile && mode === "grid" && (
          <IconButton
            icon={density === 2 ? <DenseGlyph /> : <LargeGlyph />}
            label={densityLabel(density)}
            pressable={false}
            className={total === undefined ? "ml-auto" : ""}
            onClick={() => chooseDensity(nextDensity(density))}
          />
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

/**
 * Квадратная кнопка со значком и мелкой подписью — тот же приём, что у
 * решений в колоде: объём держит сама кнопка (блик по верхней кромке,
 * затемнение к низу, нажатие вдавливает). Отличие в форме и в цвете: здесь
 * кнопка лежит на фоне страницы, а не на фотографии, поэтому цвета берутся
 * из токенов темы, а не из белого с чёрным.
 */
function IconButton({
  icon,
  label,
  active = false,
  pressable = true,
  className = "",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  /** Выбранный режим. У кнопки-действия (плотность) состояния нет. */
  active?: boolean;
  /** `false` — это действие, а не выбор: aria-pressed не нужен. */
  pressable?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressable ? active : undefined}
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition active:translate-y-px ${
        active
          ? "border-magenta/40 bg-magenta/10 text-text-0"
          : "glass border-glass-brd text-text-2 hover:text-text-0"
      } ${className}`}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

/** Сетка плиток — четыре ячейки. */
function GridGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

/** Колода: карточка поверх стопки, со следом уходящей вбок. */
function DeckGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="4" width="12" height="16" rx="2.5" />
      <path d="M4 7.5 2.6 9a2 2 0 0 0-.3 2.4l3 5.2" />
      <path d="M20 7.5 21.4 9a2 2 0 0 1 .3 2.4l-3 5.2" />
    </svg>
  );
}

/** Плотнее — девять мелких ячеек. */
function DenseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      {[3, 9.75, 16.5].map((y) =>
        [3, 9.75, 16.5].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4.5" height="4.5" rx="1" />
        )),
      )}
    </svg>
  );
}

/** Крупнее — те же четыре ячейки, что у списка: возврат к обычному виду. */
function LargeGlyph() {
  return <GridGlyph />;
}
