"use client";

import type { UnionPhoto } from "@vedamatch/shared";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { isTap, tappedPhotoIndex } from "./photo-tap";
import {
  AUTOPLAY_IDLE_MS,
  AUTOPLAY_STEP_MS,
  nextPhotoIndex,
  shouldAutoplay,
} from "./photo-autoplay";
import { PhotoTapHint } from "./photo-tap-hint";

/**
 * `thumb` — компактное превью рядом с текстом, `cover` — фото на всю карточку
 * знакомства с индикаторами-сегментами сверху, как в профильных лентах.
 */
export type RecommendationPhotoCarouselVariant = "thumb" | "cover";

export function RecommendationPhotoCarousel({
  photos,
  userName,
  variant = "thumb",
  index: controlledIndex,
  onIndexChange,
}: {
  photos: UnionPhoto[];
  userName: string;
  variant?: RecommendationPhotoCarouselVariant;
  /**
   * Индекс снаружи — когда снимок выбирают не здесь: галерея в раскрытой
   * карточке листает ту же карусель, а не заводит вторую.
   */
  index?: number;
  onIndexChange?: (index: number) => void;
}): React.ReactNode {
  const photoIdentity = photos.map(({ id, url }) => `${id}:${url}`).join("|");
  const identity = `${userName}|${photoIdentity}`;
  const [navigation, setNavigation] = useState({ identity, index: 0 });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const reduceMotion = useReducedMotion();
  /**
   * Сколько шагов карусель сделала сама подряд. Ноль — либо анкету только
   * открыли, либо человек только что листнул руками; и в том, и в другом
   * случае ждём длинную паузу, а не короткий шаг.
   */
  const [autoSteps, setAutoSteps] = useState({ identity, count: 0 });
  const steps = autoSteps.identity === identity ? autoSteps.count : 0;

  const total = photos.length;
  const uncontrolledIndex =
    navigation.identity === identity ? navigation.index : 0;
  const rawIndex = controlledIndex ?? uncontrolledIndex;
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(0, rawIndex), total - 1);

  /** Ручной выбор снимка: и здесь, и снаружи — через одну дверь. */
  function choose(index: number, byHand: boolean) {
    setNavigation({ identity, index });
    if (byHand) setAutoSteps({ identity, count: 0 });
    onIndexChange?.(index);
  }

  // Колбэк наружу держим в ref: иначе таймер перезаводился бы на каждом
  // рендере родителя и следующий снимок не наступал бы никогда.
  const notify = useRef(onIndexChange);
  useEffect(() => {
    notify.current = onIndexChange;
  }, [onIndexChange]);

  // Хук нельзя звать после раннего выхода, поэтому пустая галерея
  // отсеивается ниже, а таймер при `autoplay === false` не заводится.
  const autoplay = shouldAutoplay(total, Boolean(reduceMotion));
  useEffect(() => {
    if (!autoplay) return;
    // Первая пауза длиннее: человек читает анкету, и подменять снимок под
    // чтением — то же, что дёрнуть страницу из рук. Дальше шаг короче.
    const delay = steps === 0 ? AUTOPLAY_IDLE_MS : AUTOPLAY_STEP_MS;
    const timer = setTimeout(() => {
      const next = nextPhotoIndex(safeIndex, total);
      setNavigation({ identity, index: next });
      setAutoSteps((value) => ({
        identity,
        count: (value.identity === identity ? value.count : 0) + 1,
      }));
      // Индекс может держать родитель — тогда без этого вызова карусель
      // осталась бы на прежнем снимке.
      notify.current?.(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [autoplay, identity, total, steps, safeIndex]);

  if (photos.length === 0) return null;
  const photo = photos[safeIndex];
  const hasControls = photos.length > 1;
  const isCover = variant === "cover";

  return (
    <div
      className={
        isCover
          ? "absolute inset-0 h-full w-full overflow-hidden bg-bg-2"
          : "relative h-32 w-28 shrink-0 overflow-hidden rounded-xl bg-bg-2 sm:h-40 sm:w-36"
      }
      data-testid="recommendation-carousel"
    >
      {/* Signed gallery URLs can use varying storage hosts, so Next Image cannot
          safely enumerate their remote origins. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`${userName}, фото ${safeIndex + 1} из ${photos.length}`}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
      />

      {hasControls && (
        <>
          {/* В превью рядом с текстом тапать по половинам нечего — снимок
              112px шириной, поэтому там остаются стрелки. */}
          {!isCover && (
            <>
              <button
                type="button"
                aria-label="Предыдущее фото"
                onClick={() =>
                  choose((safeIndex - 1 + photos.length) % photos.length, true)
                }
                className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                aria-label="Следующее фото"
                onClick={() =>
                  choose((safeIndex + 1) % photos.length, true)
                }
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white shadow-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          )}

          {/*
            На полной карточке боковые позиции отданы листанию анкет, поэтому
            фото переключается тапом по половинам. Это `div`, а не кнопка:
            `onPointerDownCapture` в SwipeCard глушит перетаскивание для
            `button, a`, и кнопка во всю площадь фото сломала бы свайп.
            Клавиатурный доступ дают точки-индикаторы сверху — здесь
            `aria-hidden`, чтобы не дублировать их в дереве доступности.
          */}
          {isCover && (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              onPointerDown={(event) => {
                pointerStart.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const start = pointerStart.current;
                pointerStart.current = null;
                if (!start) return;
                if (!isTap(start, { x: event.clientX, y: event.clientY })) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                choose(
                  tappedPhotoIndex({
                    currentIndex: safeIndex,
                    total: photos.length,
                    tapX: event.clientX,
                    boundsLeft: bounds.left,
                    boundsWidth: bounds.width,
                  }),
                  true,
                );
              }}
            />
          )}
          {/*
            Сегменты в полной карточке лежали в 8px от верха — на телефоне это
            ровно под вырезом, и о том, что снимков несколько, никто не узнавал.
            Ушли ниже безопасной зоны, стали толще и получили подложку: на
            светлом снимке белая полоска сама по себе не читалась.
          */}
          <div
            className={
              isCover
                ? "absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-1.5"
                : "absolute inset-x-1 bottom-1 flex justify-center overflow-x-auto"
            }
            aria-label="Выбор фото"
          >
            {photos.map((item, photoIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Показать фото ${photoIndex + 1} из ${photos.length}`}
                aria-current={photoIndex === safeIndex ? "true" : undefined}
                onClick={() => choose(photoIndex, true)}
                className={
                  isCover
                    ? "h-5 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
                    : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    isCover
                      ? `block h-1.5 w-full rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
                          photoIndex === safeIndex
                            ? "bg-white"
                            : "bg-white/30 ring-1 ring-inset ring-black/25"
                        }`
                      : `h-3 w-3 rounded-full border border-white shadow-sm ${
                          photoIndex === safeIndex ? "bg-white" : "bg-black/45"
                        }`
                  }
                />
              </button>
            ))}
            {/*
              Цифрами — то же, что полосками: на трёх снимках полоски широкие
              и понятны, на восьми превращаются в частокол, и счётчик остаётся
              единственным, что читается с одного взгляда.
            */}
            {isCover && (
              <span
                aria-hidden="true"
                className="ml-1 shrink-0 font-mono text-[11px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
              >
                {safeIndex + 1}/{photos.length}
              </span>
            )}
          </div>

          {/* Учит тапу по краю — один раз и не перехватывая касания. */}
          {isCover && <PhotoTapHint />}
        </>
      )}
    </div>
  );
}
