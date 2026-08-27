"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { UnionRecommendation } from "@vedamatch/shared";
import { ActivityBadge } from "./activity-badge";
import { ArchiveButton } from "./archive-button";
import { ProfileDetailsList } from "./profile-details-list";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";
import { DeckToast } from "./deck-toast";
import { DecisionBadge } from "./decision-badge";
import { SwipeHint } from "./swipe-hint";
import {
  CompatibilityBreakdown,
  CompatibilityRing,
} from "./compatibility-ring";
import { UnionBoostButton } from "./union-boost-button";
import { SparkGlyph, UnionInterestIcon } from "./interest-icons";
import { intentionLabels } from "./labels";
import { EVERYTHING_URL } from "./recommendation-empty-state";
import { PhotoVerifiedBadge, VerifiedBadge } from "./verified-badge";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Насколько далеко надо утащить карточку, чтобы решение засчиталось. */
const SWIPE_DISTANCE = 110;

/**
 * Порог броска. Короткий быстрый флик — такое же осознанное решение, как
 * долгое перетаскивание: без учёта скорости он упирался в SWIPE_DISTANCE и
 * карточка отпрыгивала назад, хотя жест был уверенным.
 */
const SWIPE_VELOCITY = 520;

type SwipeDirection = "left" | "right" | "up";

/**
 * Куда улетает карточка после решения. Дальше края экрана, чтобы уход не
 * обрывался на видимой границе.
 */
const exitOffsets: Record<SwipeDirection, { x: number; y: number }> = {
  left: { x: -560, y: 40 },
  right: { x: 560, y: 40 },
  up: { x: 0, y: -680 },
};

/**
 * Пружина для возврата недоброшенной карточки и для подъёма следующей.
 * Заметно мягче линейного затухания: рука отпускает — карточка догоняет.
 */
const springy = { type: "spring", stiffness: 260, damping: 26 } as const;

/*
  Ни у одного элемента колоды нет backdrop-filter, и это не небрежность.

  Всё здесь лежит поверх фотографии, которая едет под пальцем: пока карточка
  движется, браузер обязан пересчитывать размытие фона для каждого такого
  элемента в каждом кадре. Их было девятнадцать — на Android это и есть те
  самые рывки при перелистывании. Читаемость держит плотность подложки: там,
  где было `bg-black/45` со стеклом, теперь `bg-black/60` без него.
*/

/**
 * Корпус кнопки решения. Подложки под всей панелью больше нет, поэтому объём
 * держит сама кнопка: блик по верхней кромке, затемнение к низу, светлая
 * рамка и падающая тень. Без них на светлой фотографии кнопка теряет край и
 * перестаёт читаться как нажимаемая.
 */
const actionButtonClass =
  "flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-gradient-to-b from-white/25 to-black/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_4px_rgba(0,0,0,0.35),0_6px_16px_rgba(0,0,0,0.5)] transition hover:from-white/35 hover:to-black/35 active:translate-y-px";

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
export function SwipeDeck({
  items,
  fullscreen = false,
  onExit,
  initialIndex = 0,
}: {
  items: UnionRecommendation[];
  /**
   * С какой анкеты открыть колоду. Список отдаёт сюда позицию плитки, по
   * которой нажали, — иначе тап по четвёртой открывал бы первую.
   */
  initialIndex?: number;
  /**
   * Фокус-режим: колода занимает всю высоту оверлея вместо фиксированных
   * 520px. На телефоне разница в треть экрана — при фиксированной высоте
   * фото сжимается, а под кнопками остаётся пустая полоса.
   */
  fullscreen?: boolean;
  /** Выход из фокус-режима: кнопка рисуется поверх карточки, а не над ней. */
  onExit?: () => void;
}) {
  const router = useRouter();
  /*
    Колода помнит решённых по id, а не текущую позицию по счёту.

    По счёту было нельзя: решение уходит на сервер, следом идёт
    router.refresh(), выдача возвращается уже без этой анкеты — список
    съезжает на единицу, а указатель остаётся, и на экран попадает не
    следующий человек, а тот, что за ним. Одно нажатие «познакомиться»
    съедало двоих, причём второй пролетал вообще без решения.
  */
  const [decided, setDecided] = useState<string[]>([]);
  // Зажимаем в границы: список мог отдать позицию из прошлой выдачи, а
  // пустая колода при живых анкетах выглядит как поломка.
  const [cursor, setCursor] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)),
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [exitDirection, setExitDirection] = useState<SwipeDirection>("left");
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Раскрытие живёт здесь, а не в карточке: панель деталей закрывает середину
  // карточки, и стрелки листания анкет надо на это время убрать — иначе
  // правая стрелка садится ровно на кнопку сворачивания.
  const [expanded, setExpanded] = useState(false);
  const [recycling, setRecycling] = useState(false);
  const reduceMotion = useReducedMotion();
  // Стабильная ссылка: иначе таймер подсказки перезаводился бы на каждом
  // рендере колоды и она висела бы дольше положенного.
  const clearSent = useCallback(() => setSent(null), []);

  // Решённые уходят из колоды сразу и не возвращаются, даже если выдача
  // принесла их снова (в режиме «показать всех» она так и делает).
  const visible = items.filter((item) => !decided.includes(item.user.id));
  const current = visible[cursor];
  const next = visible[cursor + 1];

  async function swipe(
    userId: string,
    decision: "like" | "superlike" | "pass",
  ) {
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/union/swipes`, {
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
    if (decided.length === 0 || undoing) return;
    setUndoing(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/union/swipes/last`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(null);
      setCanUndo(false);
      // Возвращённый встаёт на своё прежнее место в порядке выдачи, и курсор
      // идёт к нему: иначе откат показывал бы соседа, а не того, кого вернули.
      const restored = decided[decided.length - 1];
      const rest = decided.slice(0, -1);
      const restoredPosition = items
        .filter((item) => !rest.includes(item.user.id))
        .findIndex((item) => item.user.id === restored);
      setDecided(rest);
      setCursor(restoredPosition < 0 ? 0 : restoredPosition);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось вернуть анкету");
    } finally {
      setUndoing(false);
    }
  }

  /** Начало нового круга: сервер снимает пропуски, выдача перечитывается. */
  async function newCycle() {
    if (recycling) return;
    setRecycling(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/union/swipes/new-cycle`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setDecided([]);
      setCursor(0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать круг заново");
    } finally {
      setRecycling(false);
    }
  }

  function advance(direction: SwipeDirection) {
    setSent(null);
    setExpanded(false);
    // Разбор относится к конкретной анкете: оставить его открытым над
    // следующей значило бы показать чужие проценты под новым именем.
    setBreakdownOpen(false);
    setExitDirection(direction);
    // Позиция не двигается: решённый уходит из колоды, и на его место встаёт
    // следующий. Двигать ещё и указатель значило бы перескочить через одного.
    if (current) setDecided((value) => [...value, current.user.id]);
  }

  /**
   * Листание без решения: двигаем только указатель. На сервер ничего не
   * уходит — анкета не считается отсмотренной, и по колоде можно пройтись
   * туда-сюда, ничего не потратив. Откат (↺) этим не заменяется: он снимает
   * уже записанное решение, а это просто просмотр.
   */
  function browse(delta: 1 | -1) {
    const target = cursor + delta;
    if (target < 0 || target >= visible.length) return;
    setSent(null);
    setExpanded(false);
    setBreakdownOpen(false);
    setExitDirection(delta === 1 ? "left" : "right");
    setCursor(target);
  }

  if (!current) {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center">
        <p className="mb-2 font-display text-lg font-bold text-text-0">
          Круг пройден
        </p>
        <p className="text-sm text-text-1">
          Вы посмотрели всех, кто подходит по текущим фильтрам. Можно начать
          круг заново — пропущенные вернутся, лайки и архив останутся как есть.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={recycling}
            onClick={() => void newCycle()}
            className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)] disabled:opacity-50"
          >
            {recycling ? "Начинаем…" : "Показать заново"}
          </button>
          {/* Второй выход — когда дело не в круге, а в фильтрах. */}
          <a
            href={EVERYTHING_URL}
            className="text-sm font-medium text-text-2 underline-offset-4 transition hover:text-text-0 hover:underline"
          >
            Показать вообще всех
          </a>
        </div>
        {error && (
          <p className="mt-3 text-center text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        fullscreen
          ? // Ширина колоды на десктопе считается от высоты: портретная
            // пропорция 3:4 занимает экран настолько, насколько он высокий,
            // и карточка выходит вдвое крупнее прежних 384px. На телефоне
            // ширины и так ровно столько, сколько есть, — там всё по-старому.
            "mx-auto flex h-full w-full max-w-sm flex-col md:aspect-[3/4] md:w-auto md:max-w-none"
          : "mx-auto max-w-sm"
      }
    >
      {!fullscreen && (
        <p className="mb-2 text-center text-sm text-text-2">
          {cursor + 1} из {visible.length}
        </p>
      )}

      <div
        className={
          fullscreen ? "relative min-h-0 flex-1" : "relative h-[520px]"
        }
      >
        {/*
          Следующая анкета лежит под текущей уменьшенной стопкой. Без неё
          решение открывало пустой прямоугольник, и колода на секунду
          выглядела закончившейся.
        */}
        {next && <StackPreview key={next.user.id} item={next} />}

        {/*
          `custom` — единственный способ донести направление до уходящей
          карточки: её собственные пропсы заморожены на момент, когда решение
          ещё не принято, и без этого она улетала бы всегда в одну сторону.
        */}
        <AnimatePresence initial={false} mode="popLayout" custom={exitDirection}>
          <SwipeCard
            key={current.user.id}
            item={current}
            exitDirection={exitDirection}
            reduceMotion={Boolean(reduceMotion)}
            expanded={expanded}
            onExpandedChange={setExpanded}
            onLike={() => {
              void swipe(current.user.id, "like");
              advance("right");
            }}
            onSkip={() => {
              void swipe(current.user.id, "pass");
              advance("left");
            }}
            onSuperlike={() => {
              void swipe(current.user.id, "superlike");
              advance("up");
            }}
          />
        </AnimatePresence>

        {/*
          В фокус-режиме верхняя полоса экрана отдана карточке, поэтому выход,
          счётчик и возврат живут поверх фото: слева — выход, по центру —
          счётчик, справа — буст. Возврат уходит вниз, к остальным решениям.
        */}
        {fullscreen && onExit && (
          <button
            type="button"
            onClick={onExit}
            aria-label="Выйти из фокус-режима"
            // Отступ сверху — от той же базы, что и полоски-индикаторы
            // карусели: они стоят на max(0.75rem, safe-area) и вместе со
            // счётчиком «1/3» занимают 21px. Фиксированный top-8 оставлял до
            // них 0.7px, а на экране с вырезом полоски уезжали вниз и
            // наползали на кнопки.
            className="absolute left-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+1.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl text-white transition hover:bg-black/75"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}

        {fullscreen && (
          <p className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+1.75rem)] z-10 flex h-11 items-center justify-center text-sm">
            <span className="rounded-full bg-black/60 px-3 py-1 font-medium text-white">
              {cursor + 1} из {visible.length}
            </span>
          </p>
        )}

        {/*
          Листание анкет живёт у самых краёв и намеренно почти прозрачно:
          это вспомогательный путь, основной — свайп. Боковые позиции
          освободила карусель фото, которая в варианте `cover` листается
          тапом по половинам снимка.

          В раскрытой анкете стрелки гаснут: панель деталей поднимается до
          середины карточки, и правая стрелка садилась ровно на кнопку
          сворачивания. Погашенная стрелка обязана и касания пропускать —
          прозрачная, но кликабельная, она на первой анкете съедала тап по
          левой половине фото, и карусель там не листалась.
        */}
        <button
          type="button"
          onClick={() => browse(-1)}
          disabled={cursor === 0 || expanded}
          aria-label="Предыдущая анкета"
          className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-xl text-white/60 transition hover:bg-black/55 hover:text-white disabled:pointer-events-none disabled:opacity-0"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => browse(1)}
          disabled={cursor >= visible.length - 1 || expanded}
          aria-label="Следующая анкета"
          className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-xl text-white/60 transition hover:bg-black/55 hover:text-white disabled:pointer-events-none disabled:opacity-0"
        >
          <span aria-hidden="true">›</span>
        </button>

        {/* Архив ведёт себя как решение: анкета уходит, колода едет дальше. */}
        <ArchiveButton
          userId={current.user.id}
          onArchived={() => {
            router.refresh();
            advance("left");
          }}
        />

        <UnionBoostButton />

        {/*
          Панель решений лежит на самой карточке, а не полосой под ней: под
          колодой она съедала около 76px высоты, которые честнее отдать фото.
          Стоит она неподвижно — уезжает только карточка, и рука не гонится
          за кнопками между анкетами.
        */}
        {/*
          Полоса, а не узкий ряд: на телефоне палец промахивался мимо
          44-пиксельной кнопки и попадал в карточку — она тут же уезжала
          свайпом, будто решение принято. Теперь весь низ карточки принадлежит
          панели, и промах не делает ничего. Нижний отступ считается от
          безопасной зоны: под жестовой полосой системы кнопки не нажать.
        */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          // Панель лежит поверх карточки, но событие всё равно всплывает к
          // общему контейнеру: гасим его здесь, чтобы никакой будущий
          // обработчик жеста снаружи не принял нажатие кнопки за свайп.
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              void swipe(current.user.id, "pass");
              advance("left");
            }}
            aria-label="Пропустить"
            className={`${actionButtonClass} h-12 w-12 text-xl text-white`}
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo || decided.length === 0 || undoing}
            aria-label="Вернуть предыдущую анкету"
            className={`${actionButtonClass} h-11 w-11 text-lg text-white disabled:opacity-35`}
          >
            ↺
          </button>

          <CompatibilityRing
            total={current.compatibility.total}
            size={60}
            expanded={breakdownOpen}
            onClick={() => setBreakdownOpen((value) => !value)}
          />

          <button
            type="button"
            onClick={() => {
              void swipe(current.user.id, "superlike");
              advance("up");
            }}
            aria-label="Суперлайк"
            // Огонь оранжевый: суперлайк — не то же самое, что обычный
            // интерес, и в ряду одинаково белых кнопок это терялось.
            className={`${actionButtonClass} h-12 w-12 text-gold drop-shadow-[0_0_10px_var(--vm-glow-gold)]`}
          >
            <FlameIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              void swipe(current.user.id, "like");
              advance("right");
            }}
            aria-label="Познакомиться"
            // Выделяется само решение — зелёное сердце со свечением, а не
            // заливка кнопки: корпус у неё общий с соседями.
            className={`${actionButtonClass} h-12 w-12 text-like drop-shadow-[0_0_10px_var(--vm-glow-like)]`}
          >
            <HeartIcon />
          </button>
        </div>

        {breakdownOpen && (
          <CompatibilityBreakdown
            compatibility={current.compatibility}
            onClose={() => setBreakdownOpen(false)}
          />
        )}

        {/* Поверх карточки и её кнопок: первый экран учит жесту. */}
        <SwipeHint />

        {/*
          Итог решения — по центру колоды и поверх всего. Взаимность идёт с
          салютом: остальные подсказки сообщают факт, а эта — событие.
        */}
        <DeckToast
          message={sent}
          celebrate={Boolean(sent && sent.startsWith("Взаимно"))}
          onDone={clearSent}
        />

        {/* Ошибка тоже накладкой: в потоке она двигала колоду под рукой. */}
        {error && (
          <p className="pointer-events-none absolute inset-x-4 bottom-24 z-40 rounded-xl bg-sheet px-3 py-2 text-center text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Факт об анкете отдельной пилюлей: город, рост, этап. Одной строкой через
 * точку они сливались в текст, который взгляд пробегает целиком; разбитые по
 * пилюлям — читаются по одному и находятся глазом за долю секунды.
 */
function FactPill({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
      <span aria-hidden="true" className="text-white/70">
        {icon}
      </span>
      {children}
    </span>
  );
}

/**
 * Сердце «познакомиться». Залитая фигура, а не символ ♥ из шрифта: глиф
 * рисуется системным шрифтом, на телефоне выходил тонким и разного веса от
 * устройства к устройству.
 */
function HeartIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21.2c-.4 0-.8-.15-1.1-.42C6.3 16.7 3 13.6 3 9.7 3 6.6 5.4 4.2 8.4 4.2c1.5 0 2.8.62 3.6 1.6.8-.98 2.1-1.6 3.6-1.6 3 0 5.4 2.4 5.4 5.5 0 3.9-3.3 7-7.9 11.08-.3.27-.7.42-1.1.42Z" />
    </svg>
  );
}

/**
 * Пламя суперлайка. Как и сердце — своя фигура, а не эмодзи: системный 🔥 в
 * ряду нарисованных кнопок оставался единственным цветным пятном чужого
 * стиля и менялся от устройства к устройству.
 */
function FlameIcon() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.4 2.2c.3 2.6-.6 4.3-2.3 6-1.9 1.9-3 3.6-3 5.9a6 6 0 0 0 11.5 2.4c1-2.4.4-5-1.2-7.2-.4 1-1.1 1.7-2 2 .5-3.4-.8-6.4-3-9.1Z" />
      <path d="M9.6 13.8c-1 .9-1.6 2-1.6 3.3a4 4 0 0 0 4 4c-1.3-1-2-2.2-2-3.6 0-1.3.5-2.4 1.4-3.4-.6.2-1.3 0-1.8-.3Z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15.5 15.5 4l4.5 4.5L8.5 20z" />
      <path d="m8 11.5 2 2M11 8.5l2 2M14.5 5.5l2 2" />
    </svg>
  );
}

function LotusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20c-4.5 0-8-3-8-6 2 0 3.5.6 4.6 1.5" />
      <path d="M12 20c4.5 0 8-3 8-6-2 0-3.5.6-4.6 1.5" />
      <path d="M12 20c-2.5-2-4-4.6-4-7.2S9.5 7 12 4c2.5 3 4 6.2 4 8.8S14.5 18 12 20Z" />
    </svg>
  );
}

/**
 * Следующая анкета под текущей: только обложка, без каруселей и кнопок.
 * Полная карточка здесь стоила бы вторую загрузку фотографий и дублировала
 * интерактив, до которого нельзя дотянуться — она лежит под чужой.
 */
function StackPreview({ item }: { item: UnionRecommendation }) {
  const { user } = item;
  const cover = user.photos[0]?.url ?? user.avatarUrl;

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, scale: 0.9, y: 24 }}
      animate={{ opacity: 1, scale: 0.94, y: 14 }}
      transition={springy}
      className="absolute inset-0 overflow-hidden rounded-3xl border border-glass-brd bg-bg-2"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-7xl font-bold text-text-0">
          {user.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="absolute inset-0 bg-bg-0/45" />
    </motion.div>
  );
}

function SwipeCard({
  item,
  exitDirection,
  reduceMotion,
  expanded,
  onExpandedChange,
  onLike,
  onSkip,
  onSuperlike,
}: {
  item: UnionRecommendation;
  exitDirection: SwipeDirection;
  reduceMotion: boolean;
  /** Раскрытие держит колода: от него зависят и её собственные стрелки. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onLike: () => void;
  onSkip: () => void;
  onSuperlike: () => void;
}) {
  const { user, profile } = item;
  // Индекс снимка живёт здесь, а не в карусели: галерея в раскрытой карточке
  // должна листать ту же обложку, а не заводить вторую.
  const [photoIndex, setPhotoIndex] = useState(0);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const superOpacity = useTransform(y, [-140, -40], [1, 0]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const skipOpacity = useTransform(x, [-140, -40], [1, 0]);

  // Возраст переехал к имени, остальное разошлось по пилюлям, поэтому строки
  // «26 лет · Алматы · Йог» больше нет.
  const hasFacts =
    Boolean(user.city) ||
    profile.heightCm != null ||
    Boolean(user.spiritualStage);

  return (
    <motion.article
      style={{ x, y, rotate }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      // Недоброшенная карточка возвращается пружиной, а не рывком: палец
      // отпускает — она догоняет место и слегка успокаивается.
      dragTransition={{ bounceStiffness: 240, bounceDamping: 24 }}
      onDragEnd={(_event, info) => {
        const { offset, velocity } = info;
        if (offset.y < -SWIPE_DISTANCE || velocity.y < -SWIPE_VELOCITY) {
          onSuperlike();
        } else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
          onLike();
        } else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
          onSkip();
        }
      }}
      // Перетаскивание карточки перехватывает указатель, поэтому вложенным
      // кнопкам и ссылкам (карусель, шеврон, имя) отдаём событие как есть.
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) {
          event.stopPropagation();
        }
      }}
      // Приходит снизу из стопки на место ушедшей, уходит в сторону решения —
      // тем же движением, каким её толкнули. Кнопки внизу дают ту же
      // анимацию, что и палец: решение выглядит одинаково, чем бы ни приняли.
      initial={
        reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 18 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      custom={exitDirection}
      variants={{
        exit: (direction: SwipeDirection) =>
          reduceMotion
            ? { opacity: 0, transition: { duration: 0.15 } }
            : {
                // Наклон не задаём: он привязан к x через useTransform и
                // доедет до предела сам, пока карточка уходит за край.
                ...exitOffsets[direction],
                opacity: 0,
                transition: { duration: 0.38, ease: [0.22, 0.61, 0.36, 1] },
              },
      }}
      exit="exit"
      transition={reduceMotion ? { duration: 0.15 } : springy}
      className="absolute inset-0 flex touch-pan-y flex-col overflow-hidden rounded-3xl border border-glass-brd bg-bg-2"
      data-testid="swipe-card"
    >
      <div className="relative flex-1 overflow-hidden bg-bg-2">
        {user.photos.length > 0 ? (
          <RecommendationPhotoCarousel
            photos={user.photos}
            userName={user.name}
            variant="cover"
            index={photoIndex}
            onIndexChange={setPhotoIndex}
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
          className="absolute left-4 top-24 rounded-xl border-2 border-cyan px-3 py-1 font-display text-lg font-bold text-cyan"
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
          className="absolute right-4 top-24 rounded-xl border-2 border-text-2 px-3 py-1 font-display text-lg font-bold text-text-2"
        >
          ПРОПУСК
        </motion.span>

        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        {/*
          Панель решений занимает нижние 88px, и ещё 20px — воздух над ней:
          вплотную пилюли интересов читались как её продолжение.
        */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 pb-[108px]">
          {/* Обёртка, а не класс на самом значке: в колонке flex-элемент
              растягивается на всю ширину, и пилюля уезжала от края до края. */}
          <div className="flex flex-wrap items-center gap-2">
            <ActivityBadge
              activity={user.activity}
              lastSeenAt={user.lastSeenAt}
              variant="overlay"
            />
            {/* В режиме «показать всех» отсмотренные возвращаются в колоду —
                карточка обязана сказать, что решение по ней уже принято. */}
            <DecisionBadge decision={item.myDecision} variant="overlay" />
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/union/users/${user.id}`}
                  className="truncate font-display text-xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                >
                  {user.name}
                  {user.age != null && `, ${user.age}`}
                </Link>
                {/*
                  Значок стоит только у подтверждённых. Отдельной пометки
                  «не проверен» нет намеренно: непройденная проверка — не
                  свойство человека, а отсутствие события, и клеймить им
                  анкету в ленте знакомств несправедливо.
                */}
                {user.isVerifiedDevotee && <VerifiedBadge variant="dot" />}
                {user.isPhotoVerified && <PhotoVerifiedBadge variant="dot" />}
              </div>
              {/* Процент переехал в кольцо на панели решений — здесь он
                  дублировал бы сам себя в двух сантиметрах. */}
              {hasFacts && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {user.city && (
                    <FactPill icon={<HomeIcon />}>{user.city}</FactPill>
                  )}
                  {profile.heightCm != null && (
                    <FactPill icon={<RulerIcon />}>
                      {profile.heightCm} см
                    </FactPill>
                  )}
                  {user.spiritualStage && (
                    <FactPill icon={<LotusIcon />}>
                      {stageLabels[user.spiritualStage]}
                    </FactPill>
                  )}
                </div>
              )}
            </div>
            {/* Развёрнутые детали закрывают эту строку целиком, поэтому
                кнопка сворачивания живёт в них самих. */}
            {!expanded && (
              <button
                type="button"
                onClick={() => onExpandedChange(true)}
                aria-expanded={false}
                aria-label="Развернуть анкету"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/60 text-lg text-white transition hover:bg-black/75"
              >
                <span aria-hidden="true">⌃</span>
              </button>
            )}
          </div>

          {profile.interests.length > 0 && (
            <div className="mt-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white/70">
                <SparkGlyph />
                Интересы
              </p>
              {/* Тот же вид, что у фактов: на одной карточке две разные
                  пилюли читаются как два разных сорта данных. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.interests
                  .slice(0, expanded ? profile.interests.length : 3)
                  .map((interest) => (
                    <FactPill
                      key={interest}
                      icon={<UnionInterestIcon interest={interest} />}
                    >
                      {interest}
                    </FactPill>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        /*
          Детали ложатся поверх фотографии, а не отдельной панелью под ней.
          Панель отрезала себе кусок карточки: фото сжималось, её собственный
          фон темы спорил с обложкой, а нижние строки уходили под кнопки.
          Поверх фото у деталей та же природа, что у имени и пилюль, — белый
          текст по затемнению.
        */
        <div className="absolute inset-x-0 bottom-0 max-h-[70%] space-y-2 overflow-y-auto rounded-b-3xl bg-black/85 p-4 pb-[108px]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-lg font-bold text-white">
              {user.name}
              {user.age != null && `, ${user.age}`}
            </p>
            <button
              type="button"
              onClick={() => onExpandedChange(false)}
              aria-expanded
              aria-label="Свернуть анкету"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg text-white transition hover:bg-white/25"
            >
              <span aria-hidden="true">⌄</span>
            </button>
          </div>

          {/*
            Все снимки разом. Обложка листается по одному, и человек не
            обязан догадываться, сколько их всего: здесь видно и сколько, и
            какой сейчас, а тап ведёт обложку под панелью на нужный.
          */}
          {user.photos.length > 1 && (
            <ul
              // Сегменты-индикаторы наверху ведут туда же, поэтому имена у
              // миниатюр другие: два элемента с одинаковой подписью
              // скринридер читает как повтор одного и того же.
              aria-label="Все фото"
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            >
              {user.photos.map((photo, photoIndexInList) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex(photoIndexInList)}
                    aria-label={`Фото ${photoIndexInList + 1}`}
                    aria-current={
                      photoIndexInList === photoIndex ? "true" : undefined
                    }
                    className={`block h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      photoIndexInList === photoIndex
                        ? "border-white"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* Подписанные ссылки галереи ходят с разных хостов —
                        Next Image не может перечислить их источники. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {profile.intentions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.intentions.slice(0, 3).map((intention) => (
                <span
                  key={intention.type}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white"
                >
                  {intentionLabels[intention.type]} {intention.weight}%
                </span>
              ))}
            </div>
          )}
          {profile.about && (
            <p className="text-sm text-white/85">{profile.about}</p>
          )}
          <ProfileDetailsList details={profile} tone="overlay" />
        </div>
      )}
    </motion.article>
  );
}
