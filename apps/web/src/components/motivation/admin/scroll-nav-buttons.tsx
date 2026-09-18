"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp } from "lucide-react";
import {
  nextScrollTop,
  scrollButtonsVisibility,
  type ScrollButtonsVisibility,
  type ScrollMetrics,
  type ScrollNavAction,
} from "./scroll-nav";

const HIDDEN: ScrollButtonsVisibility = {
  toTop: false,
  upTenth: false,
  downTenth: false,
  toBottom: false,
};

/** Снимок прокрутки всей страницы — крутим окно целиком, не врезку внутри. */
function readMetrics(): ScrollMetrics {
  const root = document.documentElement;
  return {
    scrollTop: root.scrollTop || document.body.scrollTop,
    scrollHeight: root.scrollHeight,
    clientHeight: root.clientHeight,
  };
}

/**
 * Плавающие кнопки быстрой прокрутки (VED-265, чек-лист: «стрелочка вниз —
 * промотать вниз до конца… стрелка вверх — промотать вверх до конца…
 * промотать на одну десятую длины вниз… промотать на одну десятую вверх»).
 * Справа у края, над мини-плеером и нижними панелями — как в мессенджерах.
 *
 * Один и тот же компонент стоит на «Опубликованных», «Скрытых» и
 * «Заготовках» (VED-265: «один общий компонент для всех списков редакции
 * Вдохновения») — длинная лента у всех трёх это сама страница, а не врезка
 * со своей прокруткой, поэтому крутит `window`, а не какой-то `ref`.
 *
 * Видимость считает чистая `scrollButtonsVisibility` (`scroll-nav.ts`) —
 * компонент только слушает `scroll`/`resize`/рост содержимого и
 * перекладывает результат в состояние.
 */
export function ScrollNavButtons() {
  const [visible, setVisible] = useState<ScrollButtonsVisibility>(HIDDEN);

  useEffect(() => {
    const update = () => setVisible(scrollButtonsVisibility(readMetrics()));
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    // Список догружается и растёт уже после первого рендера (картинки,
    // подгрузка карточек) — без этого кнопки «до конца» пропадали бы
    // раньше времени, ещё до того как страница реально доскроллена.
    // В тестовом DOM `ResizeObserver` может не быть — тогда обходимся
    // `scroll`/`resize`.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  if (!visible.toTop && !visible.upTenth && !visible.downTenth && !visible.toBottom) {
    return null;
  }

  const go = (action: ScrollNavAction) => {
    const top = nextScrollTop(readMetrics(), action);
    // `prefers-reduced-motion` — плавная прокрутка выключена целиком, а не
    // просто ускорена: для кого-то анимация окна — не «быстрее», а укачивает.
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div
      className="glass pointer-events-auto fixed right-3 z-30 flex flex-col gap-1 rounded-2xl p-1 sm:right-6"
      // Мини-плеер висит fixed поверх любой страницы (VED-248, `z-40`,
      // высота ~64px плюс отступ) — запас берёт с большим шагом, чем его
      // рост от изменения safe-area, чтобы кнопки никогда не оказались под
      // ним или под будущей нижней панелью.
      style={{ bottom: "max(6rem, calc(env(safe-area-inset-bottom) + 5rem))" }}
    >
      {visible.toTop && (
        <NavButton label="Промотать наверх до конца" onClick={() => go("top")}>
          <ChevronsUp aria-hidden className="size-5" />
        </NavButton>
      )}
      {visible.upTenth && (
        <NavButton
          label="Промотать на одну десятую вверх"
          onClick={() => go("up-tenth")}
        >
          <ChevronUp aria-hidden className="size-5" />
        </NavButton>
      )}
      {visible.downTenth && (
        <NavButton
          label="Промотать на одну десятую вниз"
          onClick={() => go("down-tenth")}
        >
          <ChevronDown aria-hidden className="size-5" />
        </NavButton>
      )}
      {visible.toBottom && (
        <NavButton label="Промотать вниз до конца" onClick={() => go("bottom")}>
          <ChevronsDown aria-hidden className="size-5" />
        </NavButton>
      )}
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      // 44px — тот же минимум тап-цели, что и у остальных кнопок-значков
      // редакции (`ui.ts`, `iconButton`), только без своей рамки: рамку и
      // фон уже даёт общий `glass`-контейнер.
      className="inline-flex size-11 items-center justify-center rounded-xl text-text-1 transition-colors hover:bg-glass-brd/30 hover:text-text-0"
    >
      {children}
    </button>
  );
}
