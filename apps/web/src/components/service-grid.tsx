"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Pin, Rows3 } from "lucide-react";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceCard } from "@/components/service-card";
import { ServiceTile } from "@/components/service-tile";
import {
  effectiveMode,
  markServiceOpened,
  readLayout,
  serverLayout,
  subscribeToLayout,
  writeLayout,
} from "@/lib/service-layout";

interface ServiceExtra {
  badgeCount?: number;
  extra?: ReactNode;
  /** Кнопки в шапке карточки, справа от названия (VED-401). */
  headerExtra?: ReactNode;
  /** Куда ведёт сама карточка, если не на главную сервиса (VED-432). */
  href?: string;
}

/** Летящая за курсором копия карточки. */
interface DragVisual {
  width: number;
  height: number;
  /** Смещение курсора внутри карточки, чтобы она не «прыгала» под указатель углом. */
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
}

export function ServiceGrid({
  services,
  userId,
  extras,
  toolbarStart,
  toolbarEnd,
}: {
  services: ServiceCardType[];
  userId: string;
  extras?: Record<string, ServiceExtra>;
  /**
   * Левый край строки над сеткой. Сюда главная ставит «Настроить кнопки»
   * (VED-111): все настройки вида главной — в одной строке, а не одна под
   * кнопками, другая над сеткой через плеер.
   */
  toolbarStart?: ReactNode;
  /**
   * Правый край строки — перед переключателем вида. Туда главная перенесла
   * «Кнопки» (VED-504), отдав левый край числу участников.
   */
  toolbarEnd?: ReactNode;
}) {
  /**
   * Режим читается через `useSyncExternalStore`, а не эффектом: у него есть
   * отдельный серверный снимок, и React знает, что разметка сервера и первый
   * клиентский рендер разойдутся. Тот же приём, что у советника.
   */
  const getLayout = useCallback(() => readLayout(userId), [userId]);
  const layout = useSyncExternalStore(
    subscribeToLayout,
    getLayout,
    serverLayout,
  );
  const mode = effectiveMode(layout);
  const compact = mode === "compact";

  const [order, setOrder] = useState<string[]>(() => services.map((s) => s.id));
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [visual, setVisual] = useState<DragVisual | null>(null);
  /**
   * Режим перестановки. Стрелки на телефоне занимают по 44px над каждой
   * карточкой, а нужны они раз в сто заходов — поэтому они не висят всегда,
   * а включаются кнопкой и рендерятся условно: спрятать их через `hidden`
   * значило бы оставить место занятым.
   *
   * Здесь же булавка «Закрепить сверху» (VED-401: «убери насовсем кнопку
   * прикрепить с главного экрана и перенеси её внутрь окна Порядок»): в
   * шапке каждой карточки она висела постоянно ради действия, которое
   * делают раз, и занимала место, где у «Вдохновения» теперь свои кнопки.
   * Поэтому «Порядок» есть и на широком экране: перетаскивание мышью там
   * осталось, а закрепить карточку больше негде.
   */
  const [reordering, setReordering] = useState(false);

  const slotRefs = useRef(new Map<string, HTMLDivElement | null>());
  // Порядок читается из обработчиков окна, которые живут дольше одного рендера.
  const orderRef = useRef(order);
  orderRef.current = order;
  const pinnedRef = useRef(pinnedId);
  pinnedRef.current = pinnedId;

  useEffect(() => {
    const saved = readLayout(userId);
    if (!saved.order.length) return;
    const knownIds = new Set(services.map((s) => s.id));
    const savedKnown = saved.order.filter((id) => knownIds.has(id));
    const missing = services.map((s) => s.id).filter((id) => !savedKnown.includes(id));
    setOrder([...savedKnown, ...missing]);
    setPinnedId(saved.pinnedId && knownIds.has(saved.pinnedId) ? saved.pinnedId : null);
    // Пересчитываем только когда меняется список сервисов с сервера, не на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, services.map((s) => s.id).join(",")]);

  // Пишем точечно: режим лежит в том же ключе, и полная перезапись объекта
  // стёрла бы его при первой же перестановке карточек.
  const save = useCallback(
    (nextOrder: string[], nextPinned: string | null) => {
      writeLayout(userId, { order: nextOrder, pinnedId: nextPinned });
    },
    [userId],
  );

  const persist = useCallback(
    (nextOrder: string[], nextPinned: string | null) => {
      setOrder(nextOrder);
      setPinnedId(nextPinned);
      save(nextOrder, nextPinned);
    },
    [save],
  );

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const sortedByOrder = useMemo(
    () => order.map((id) => byId.get(id)).filter((s): s is ServiceCardType => Boolean(s)),
    [order, byId],
  );

  const displayed = useMemo(() => {
    if (!pinnedId) return sortedByOrder;
    const pinned = byId.get(pinnedId);
    if (!pinned) return sortedByOrder;
    return [pinned, ...sortedByOrder.filter((s) => s.id !== pinnedId)];
  }, [sortedByOrder, pinnedId, byId]);

  function moveTo(id: string, targetIndex: number) {
    const withoutMoved = order.filter((x) => x !== id);
    const clamped = Math.max(0, Math.min(targetIndex, withoutMoved.length));
    withoutMoved.splice(clamped, 0, id);
    persist(withoutMoved, pinnedId);
  }

  function moveByStep(id: string, delta: number) {
    moveTo(id, order.indexOf(id) + delta);
  }

  function togglePin(id: string) {
    persist(order, pinnedId === id ? null : id);
  }

  /**
   * Перетаскивание на pointer-событиях, а не на HTML5 drag-and-drop: нативный DnD
   * ломается, если во время перетаскивания переставлять DOM-узел источника — а именно
   * это и нужно, чтобы карточка под курсором уезжала и освобождала место.
   */
  function startDrag(id: string, e: ReactPointerEvent<HTMLElement>) {
    const slot = slotRefs.current.get(id);
    if (!slot || e.button !== 0) return;
    e.preventDefault();

    const rect = slot.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    // Геометрию ячеек снимаем один раз: сами ячейки при перетаскивании не двигаются,
    // между ними переезжают только карточки. Мерить их «вживую» нельзя — во время
    // пружинной анимации карточки в полёте, и попадание курсора определяется через раз.
    const cells = displayed
      .map((s) => slotRefs.current.get(s.id))
      .filter((el): el is HTMLDivElement => Boolean(el))
      .map((el) => el.getBoundingClientRect());
    // Текущая последовательность ведётся здесь: обработчик живёт всё перетаскивание,
    // а состояние React за ним не поспевает между быстрыми pointermove.
    let sequence = displayed.map((s) => s.id);
    // Закреплённая карточка держится первой — на её место вставать нельзя.
    const minIndex = pinnedId ? 1 : 0;

    setDragId(id);
    setVisual({
      width: rect.width,
      height: rect.height,
      offsetX,
      offsetY,
      x: e.clientX,
      y: e.clientY,
    });
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      setVisual((cur) => (cur ? { ...cur, x: ev.clientX, y: ev.clientY } : cur));

      const targetCell = cells.findIndex(
        (r) => ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom,
      );
      if (targetCell === -1) return;
      const targetIndex = Math.max(minIndex, targetCell);
      if (sequence.indexOf(id) === targetIndex) return;

      const next = sequence.filter((x) => x !== id);
      next.splice(targetIndex, 0, id);
      sequence = next;
      setOrder(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      setDragId(null);
      setVisual(null);
      save(orderRef.current, pinnedRef.current);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const draggedService = dragId ? byId.get(dragId) : null;

  const openService = () => markServiceOpened(userId);

  return (
    <>
      {/* Кнопки настройки держатся слева одной группой, вид — справа
          (VED-127): «Изменить порядок» стояла у переключателя вида, через
          пустое место от «Кнопок», и читалась как часть переключателя.

          `flex-wrap` — от VED-383: ряд не помещался в 320 точек и толкал всю
          страницу (переполнение документа 76px на 320 и 21px на 375), а
          уезжал за правый край именно переключатель вида — то есть настройка
          пропадала с экрана совсем. Перенос выбран вместо своей
          горизонтальной прокрутки: прокрутка оставила бы переключатель за
          краем ровно так же, пока его не найдут, а перенос ничего не прячет,
          не заводит новой остановки для клавиатуры и держит 0 переполнения
          при любой ширине и любом наборе кнопок. Вертикальный зазор берётся
          из того же `gap-2`. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {toolbarStart}
        {/* Переключатель стоит над сеткой, а не в шапке портала: он влияет
            ровно на то, что под ним, и рядом с тем, на что влияет, его не
            приходится искать. */}
        <div className="ml-auto flex items-center gap-2">
        {toolbarEnd}
        {/* Перестановка нужна редко, поэтому переключатель тихий и только
            там, где нет перетаскивания мышью. В компактном режиме её нет
            вовсе: в плитке негде стоять ни ручке, ни стрелкам. */}
        {!compact && (
          <button
            type="button"
            onClick={() => setReordering((on) => !on)}
            aria-pressed={reordering}
            /* Подпись короткая, имя — полное: тот же приём, что у соседних
               «Кнопок» (VED-111). Полная уходит в имя и подсказку; без этого
               ряд при спрятанной ленте переносился уже на 375 (VED-383). */
            aria-label={reordering ? "Готово" : "Изменить порядок"}
            title={reordering ? "Готово" : "Изменить порядок и закрепить"}
            className={`whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              reordering
                ? "border-cyan/40 bg-cyan/10 text-cyan"
                : "border-glass-brd text-text-2 hover:text-text-0"
            }`}
          >
            {reordering ? "Готово" : "Порядок"}
          </button>
        )}

        <div
          role="group"
          aria-label="Вид сервисов"
          className="flex rounded-xl border border-glass-brd p-0.5"
        >
          {(
            [
              ["compact", LayoutGrid, "Плитками"],
              ["detailed", Rows3, "Подробно"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => writeLayout(userId, { mode: value })}
              aria-pressed={mode === value}
              aria-label={label}
              title={label}
              className={`rounded-lg p-1.5 transition-colors ${
                mode === value
                  ? "bg-glass text-text-0"
                  : "text-text-2 hover:text-text-0"
              }`}
            >
              <Icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
        </div>
      </div>

      {compact ? (
        <section className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {displayed.map((service) => (
            <ServiceTile
              key={service.id}
              service={service}
              badgeCount={extras?.[service.id]?.badgeCount}
              onOpen={openService}
            />
          ))}
        </section>
      ) : (
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
        {displayed.map((service, index) => {
          const isDragged = dragId === service.id;
          return (
            <motion.div
              key={service.id}
              ref={(el: HTMLDivElement | null) => {
                slotRefs.current.set(service.id, el);
              }}
              layout
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
              className={`relative flex h-full flex-col rounded-2xl ${
                isDragged ? "border-2 border-dashed border-cyan/70 bg-cyan/5" : ""
              }`}
            >
              {reordering && (
                <div className="mb-2 flex items-center justify-end gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => togglePin(service.id)}
                    /* Переключатель: имя постоянное, состояние — в
                       `aria-pressed`. Меняющееся имя вместе с `aria-pressed`
                       читалка объявила бы дважды («Открепить, нажата»), а
                       видимое слово обязано входить в имя (WCAG 2.5.3). */
                    aria-pressed={pinnedId === service.id}
                    aria-label={`Закрепить сверху: ${service.name}`}
                    title={
                      pinnedId === service.id
                        ? "Закреплена сверху — нажмите, чтобы открепить"
                        : "Закрепить сверху"
                    }
                    className={`mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors ${
                      pinnedId === service.id
                        ? "text-gold"
                        : "text-text-1 hover:text-text-0"
                    }`}
                  >
                    <Pin
                      aria-hidden
                      className="size-4"
                      fill={pinnedId === service.id ? "currentColor" : "none"}
                    />
                    Закрепить
                  </button>
                  <button
                    type="button"
                    onClick={() => moveByStep(service.id, -1)}
                    disabled={index === 0}
                    aria-label="Переместить выше"
                    className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveByStep(service.id, 1)}
                    disabled={index === displayed.length - 1}
                    aria-label="Переместить ниже"
                    className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              )}
              {/* Карточку не размонтируем: её размеры держат пустой слот ровно того же размера. */}
              <div className={`flex-1 ${isDragged ? "invisible" : ""}`}>
                <ServiceCard
                  service={service}
                  badgeCount={extras?.[service.id]?.badgeCount}
                  extra={extras?.[service.id]?.extra}
                  headerExtra={extras?.[service.id]?.headerExtra}
                  href={extras?.[service.id]?.href}
                  isPinned={pinnedId === service.id}
                  onOpen={openService}
                  dragHandleProps={{
                    onPointerDown: (e) => startDrag(service.id, e),
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </section>
      )}

      {draggedService && visual && (
        <div
          className="pointer-events-none fixed z-50 rotate-1 opacity-95 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
          style={{
            width: visual.width,
            left: visual.x - visual.offsetX,
            top: visual.y - visual.offsetY,
          }}
        >
          <ServiceCard
            service={draggedService}
            badgeCount={extras?.[draggedService.id]?.badgeCount}
            extra={extras?.[draggedService.id]?.extra}
            headerExtra={extras?.[draggedService.id]?.headerExtra}
            isPinned={pinnedId === draggedService.id}
          />
        </div>
      )}
    </>
  );
}
