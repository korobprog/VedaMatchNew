"use client";

import {
  Briefcase,
  ChevronLeft,
  LayoutGrid,
  MessagesSquare,
  Music,
  Rows3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ServiceIcon } from "@/components/icons/service-icons";
import { useServiceNames } from "@/components/service-catalog-provider";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import {
  AstroScreen,
  ChatScreen,
  MarketScreen,
  UnionScreen,
  VedabaseScreen,
} from "@/components/landing/portal-preview-screens";
import { TourFinger } from "@/components/landing/tour-cursor";
import { SERVICE_CONTENT } from "@/lib/service-content";
import {
  CURSOR_TRAVEL,
  TOUR_DURATIONS,
  TOUR_START,
  cursorTarget,
  isDemoOpen,
  isPressing,
  nextTourState,
  type TourState,
} from "@/lib/landing/preview-tour";
import { cn } from "@/lib/utils";

/**
 * Уменьшенная копия главной страницы кабинета: гость видит, куда попадёт
 * после входа, до того как заведёт аккаунт. Не скриншот — настоящие иконки
 * и названия сервисов из каталога, поэтому переименование сервиса в админке
 * доезжает и сюда, а не оставляет на лендинге устаревшую картинку.
 *
 * Поверх макета идёт ролик: курсор обходит пять сервисов и на каждом
 * открывает мини-экран с тем, что внутри. Порядок и тайминги — в
 * lib/landing/preview-tour.ts, содержимое экранов — в
 * portal-preview-screens.tsx.
 *
 * Целиком декоративна и скрыта от скринридера: тот же список сервисов
 * лежит ниже разделом «Сервисы» — уже ссылками и с описаниями, — а
 * дублирующая озвучка макета только удлиняет путь. По той же причине здесь
 * нет ни заголовков, ни ссылок: картинке нечего давать фокусу.
 */

/** Ходовые сервисы крупными кнопками — как в кабинете над сеткой. */
const FEATURED: Array<{ slug: string; name: string; Icon: LucideIcon; accent: string }> = [
  { slug: "chat", name: "Общение", Icon: MessagesSquare, accent: "text-cyan" },
  { slug: "music", name: "Музыка", Icon: Music, accent: "text-violet" },
  { slug: "work", name: "Работа", Icon: Briefcase, accent: "text-gold" },
];

/** Значок «Общения» повторяет счётчик непрочитанного из кабинета. */
const UNREAD_SAMPLE = 3;

/**
 * Фото в аватаре. Тот же снимок, что и в демо-колоде Знакомств: лежит
 * локально в public, поэтому макет не зависит ни от S3, ни от того, дал ли
 * кто-нибудь согласие на публичный показ.
 */
const AVATAR_PHOTO = "/landing/profiles/ekaterina.jpg";

/**
 * Сервисы сетки. «Общение» отсеяно так же, как в кабинете: оно уже стоит
 * крупной кнопкой выше, и второй раз в списке было бы шумом (см. фильтр по
 * FEATURED_ROUTES на главной).
 */
const GRID = SERVICE_CONTENT.filter((service) => service.slug !== "chat");

/**
 * Маршрут ролика. Пять остановок, а не все одиннадцать: круг из одиннадцати
 * длится больше минуты, и гость уходит со страницы, не досмотрев.
 *
 * Музыки здесь нет не потому, что нечего показать — она работает и включена, —
 * а потому что ролик намеренно короткий. Добавлять шестую остановку значит
 * ломать то самое решение; если Музыка нужнее одной из нынешних, её надо
 * менять местами, а не дописывать.
 *
 * Запасное имя нужно по той же причине, что и в SERVICE_CONTENT: настоящее
 * приходит из каталога, и переименование в админке доезжает и до ролика.
 */
const STOPS: Array<{ slug: string; name: string; Screen: () => React.ReactElement }> = [
  { slug: "union", name: "Знакомства", Screen: UnionScreen },
  { slug: "chat", name: "Общение", Screen: ChatScreen },
  { slug: "astro", name: "Астрология", Screen: AstroScreen },
  { slug: "vedabase", name: "Библиотека", Screen: VedabaseScreen },
  { slug: "market", name: "Рынок", Screen: MarketScreen },
];

export function PortalPreview({ className }: { className?: string }) {
  const names = useServiceNames();

  const [tour, setTour] = useState<TourState>(TOUR_START);
  /**
   * Ролик стартует выключенным и включается уже в браузере: сервер не знает
   * ни про `prefers-reduced-motion`, ни про то, виден ли макет, — а разойтись
   * с разметкой сервера при гидратации нельзя.
   */
  const [motionOk, setMotionOk] = useState(false);
  const [inView, setInView] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLSpanElement>(null);
  const tilesRef = useRef<Record<string, HTMLElement | null>>({});
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const running = motionOk && inView;
  const stop = STOPS[tour.index];
  const demoOpen = running && isDemoOpen(tour.phase);
  const pressing = running && isPressing(tour.phase);
  /** Плитка отвечает на нажатие только пока экран ещё не открыт. */
  const pressedSlug = running && tour.phase === "press" ? stop.slug : null;

  const setTile = useCallback(
    (slug: string) => (el: HTMLElement | null) => {
      tilesRef.current[slug] = el;
    },
    [],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotionOk(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    // Без IntersectionObserver (jsdom в тестах) ролик просто идёт всегда:
    // единственное, что теряется, — экономия на прокрученном мимо макете.
    if (!stage || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /**
   * Курсор наводится по фактическим координатам цели, а не по процентам от
   * окна: сетка перестраивается на узком экране, и зашитые проценты увели бы
   * курсор в пустоту.
   */
  const aim = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const target =
      cursorTarget(tour.phase) === "back" ? backRef.current : tilesRef.current[stop.slug];
    if (!target) return;
    const from = stage.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setCursor({
      x: to.left - from.left + to.width / 2,
      y: to.top - from.top + to.height / 2,
    });
  }, [stop.slug, tour.phase]);

  useLayoutEffect(() => {
    if (!running) return;
    aim();
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    window.addEventListener("resize", aim);
    return () => window.removeEventListener("resize", aim);
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setTour((state) => nextTourState(state, STOPS.length)),
      TOUR_DURATIONS[tour.phase],
    );
    return () => clearTimeout(timer);
  }, [running, tour]);

  return (
    <div aria-hidden className={cn("relative select-none", className)}>
      <div className="relative mx-auto w-full max-w-[420px]">
        <div className="rounded-3xl border border-glass-brd bg-bg-1 p-2 shadow-2xl shadow-black/40">
          {/* Обвязка окна: три точки — привычный знак «это приложение» */}
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-magenta/60" />
            <span className="h-2 w-2 rounded-full bg-gold/60" />
            <span className="h-2 w-2 rounded-full bg-cyan/60" />
          </div>

          <div className="rounded-2xl bg-bg-0 p-3.5">
            {/* Шапка портала — она же и внутри сервиса, поэтому вне сцены */}
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VedaMatchMark className="h-6 w-6" />
                <span className="font-display text-sm font-bold text-text-0">
                  VedaMatch
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-magenta" />
                {/* Аватар как в шапке портала — там ровно такой же
                    кружок с фотографией. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={AVATAR_PHOTO}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              </div>
            </div>

            {/*
              Сцена. Главный экран остаётся в разметке всегда, даже под
              открытым сервисом: он задаёт высоту окна — иначе оно прыгало бы
              на каждом переходе — и держит плитки измеримыми для курсора.
            */}
            <div ref={stageRef} className="relative">
              <div className={cn(demoOpen && "invisible")}>
                {/* Строка советника */}
                <div className="mb-3.5 rounded-xl border border-glass-brd bg-glass px-3 py-2">
                  <p className="text-[11px] font-semibold text-text-0">
                    Приветствуем на портале VedaMatch!
                  </p>
                  <p className="text-[10px] leading-tight text-text-2">
                    Сегодня экадаши · 3 новых отклика
                  </p>
                </div>

                {/* Ходовые сервисы */}
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {FEATURED.map(({ slug, name, Icon, accent }) => (
                    <div
                      key={slug}
                      ref={setTile(slug)}
                      className={cn(
                        "flex min-h-[62px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border bg-glass px-1 text-center transition-transform duration-150",
                        pressedSlug === slug
                          ? "scale-95 border-mint-edge"
                          : "border-glass-brd",
                      )}
                    >
                      <span className="relative">
                        <Icon className={cn("size-5", accent)} />
                        {slug === "chat" && (
                          <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-magenta px-1 text-[9px] font-bold leading-none text-white">
                            {UNREAD_SAMPLE}
                          </span>
                        )}
                      </span>
                      <span className="w-full break-words text-[10px] font-semibold leading-tight text-text-0">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Переключатель вида — он же стоит над сеткой в кабинете */}
                <div className="mb-2 flex justify-end">
                  <div className="flex rounded-lg border border-glass-brd p-0.5">
                    <span className="rounded-md bg-glass p-1 text-text-0">
                      <LayoutGrid className="size-3" />
                    </span>
                    <span className="p-1 text-text-2">
                      <Rows3 className="size-3" />
                    </span>
                  </div>
                </div>

                {/*
                  Сетка сервисов в режиме «плитками». На узком экране колонок
                  три, а не четыре: в 288-пиксельном окне четвёртая колонка
                  оставляет плитке 53px, и «Вдохновение» в 9px (58px) ломается
                  посреди слога. Три колонки дают 89px — имя встаёт строкой.
                */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {GRID.map((service) => (
                    <div
                      key={service.slug}
                      ref={setTile(service.slug)}
                      className={cn(
                        "flex min-h-[58px] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-glass px-0.5 text-center transition-transform duration-150",
                        pressedSlug === service.slug
                          ? "scale-95 border-mint-edge"
                          : "border-glass-brd",
                      )}
                    >
                      <ServiceIcon slug={service.slug} className="h-5 w-5 shrink-0" />
                      {/*
                        Имя приходит из каталога и может стать длиннее «Вдохновения»
                        после переименования в админке. Ширина плитки — около 62px,
                        запас у самого длинного нынешнего имени всего пара пикселей,
                        поэтому подпись обязана переноситься, а не вылезать наружу.
                      */}
                      <span className="w-full break-words text-[9px] font-medium leading-tight text-text-1">
                        {names(service.slug, service.name)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {demoOpen && (
                <div
                  key={stop.slug}
                  className="preview-screen-in absolute inset-0 flex flex-col bg-bg-0"
                >
                  <div className="mb-2.5 flex items-center gap-1.5">
                    <span
                      ref={backRef}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-lg border bg-glass text-text-1 transition-transform duration-150",
                        tour.phase === "back"
                          ? "scale-90 border-mint-edge"
                          : "border-glass-brd",
                      )}
                    >
                      <ChevronLeft className="size-3" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ServiceIcon slug={stop.slug} className="size-4" />
                      <span className="text-[11px] font-semibold text-text-0">
                        {names(stop.slug, stop.name)}
                      </span>
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    <stop.Screen />
                  </div>
                </div>
              )}

              {running && cursor && (
                <div
                  className="pointer-events-none absolute left-0 top-0 z-20 transition-transform ease-in-out"
                  style={{
                    transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
                    transitionDuration: `${CURSOR_TRAVEL[tour.phase]}ms`,
                  }}
                >
                  <TourFinger pressing={pressing} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Свечение под окном — как у макета телефона на странице Знакомств */}
        <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-magenta/20 via-cyan/20 to-gold/20 opacity-50 blur-xl" />
      </div>
    </div>
  );
}
