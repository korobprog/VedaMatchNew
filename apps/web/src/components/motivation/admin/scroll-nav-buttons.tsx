"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp } from "lucide-react";
import {
  nextScrollTop,
  sameScrollButtonsVisibility,
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

/**
 * Поле справа у списка на телефоне — под плавающие кнопки прокрутки.
 *
 * Раньше кнопки висели в 12px от края и ложились ровно на правый столбец
 * кнопок карточки редакции («Поделиться», «Скрытые»): у края экрана на
 * телефоне свободного места нет, карточка идёт почти во всю ширину. Теперь
 * на телефоне кнопки прижаты к самому краю (50px шириной: клетка 44px, поля
 * по 2px и рамка `glass`), а список отодвигается от них на 24px. Вместе с
 * отступом страницы (16px) и полем карточки (16px) это даёт 56px от края
 * до последней кнопки карточки — на 6px больше, чем занимает колонка
 * прокрутки. Замерено на 320, 360 и 412px.
 *
 * С `sm` и шире кнопки уходят в поля страницы (`sm:right-6`), а у списка
 * справа снова ничего не отнимается. Класс один на все списки, где стоят
 * `ScrollNavButtons`, чтобы поле и ширина колонки не разошлись.
 */
export const SCROLL_NAV_GUTTER = "max-sm:pr-6";

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
 * перекладывает результат в состояние, с троттлингом через
 * `requestAnimationFrame` и сравнением по полям (см. ниже).
 */
export function ScrollNavButtons() {
  const [visible, setVisible] = useState<ScrollButtonsVisibility>(HIDDEN);

  useEffect(() => {
    // `scroll` летит десятками раз за один жест (даже с `passive: true`) —
    // без троттлинга каждое событие гоняло бы пересчёт и обновляло
    // состояние. `requestAnimationFrame` схлопывает любое число событий
    // между двумя кадрами в один пересчёт, а `frame` не даёт поставить
    // в очередь второй кадр, пока первый не отработал (круг 2, VED-265).
    let frame: number | null = null;

    const applyVisibility = () => {
      frame = null;
      setVisible((current) => {
        const next = scrollButtonsVisibility(readMetrics());
        // Сравнение по четырём полям, не по ссылке: без него `setVisible`
        // с новым объектом на каждый кадр скролла перерисовывал бы
        // компонент, даже когда показывать нужно то же самое.
        return sameScrollButtonsVisibility(current, next) ? current : next;
      });
    };

    const requestUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyVisibility);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    // `requestAnimationFrame` не тикает у вкладки в фоне — если прокрутка
    // страницы изменилась, пока вкладка была скрыта (например, программно),
    // запрошенный кадр просто ждёт возврата. `visibilitychange` досчитывает
    // видимость сразу по возвращении, а не только при следующем `scroll`.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") applyVisibility();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Список догружается и растёт уже после первого рендера (картинки,
    // подгрузка карточек) — без этого кнопки «до конца» пропадали бы
    // раньше времени, ещё до того как страница реально доскроллена.
    // Наблюдаем `document.body`, а не список: крутится всё окно целиком
    // (см. комментарий к компоненту), и высота, от которой считается
    // видимость, зависит от страницы целиком, а не только от одного блока.
    // В тестовом DOM `ResizeObserver` может не быть — тогда обходимся
    // `scroll`/`resize`.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(requestUpdate);
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
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
      // На телефоне — вплотную к краю, без скругления справа: так
      // колонка занимает меньше всего ширины, а список освобождает под неё
      // поле `SCROLL_NAV_GUTTER`. С `sm` — прежний плавающий вид в полях.
      className="glass pointer-events-auto fixed right-0 z-30 flex flex-col gap-1 rounded-l-2xl p-0.5 sm:right-6 sm:rounded-2xl sm:p-1"
      // `--vm-player-space` — тот же токен, которым портал резервирует
      // место под полосу плеера снизу страницы (`globals.css`): он уже
      // учитывает свёрнутый/развёрнутый вид (`data-collapsed`), подъём
      // (`data-lifted`) и safe-area, и меняется вместе с полосой, а не
      // отдельной константой, которая рано или поздно с ней разойдётся
      // (круг 2, VED-265: захардкоженный отступ уходил под развёрнутый
      // плеер на телефоне). Без плеера переменная не объявлена вовсе —
      // фоллбэк `0px`. Ещё 0.75rem — зазор между кнопками и полосой/низом
      // экрана, когда плеера нет.
      style={{ bottom: "calc(var(--vm-player-space, 0px) + 0.75rem)" }}
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
