"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceCard } from "@/components/service-card";

interface StoredLayout {
  order: string[];
  pinnedId: string | null;
}

function storageKey(userId: string) {
  return `vedamatch:service-layout:${userId}`;
}

function loadLayout(userId: string): StoredLayout | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.order)) return null;
    return { order: parsed.order, pinnedId: parsed.pinnedId ?? null };
  } catch {
    return null;
  }
}

interface ServiceExtra {
  badgeCount?: number;
  extra?: ReactNode;
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
}: {
  services: ServiceCardType[];
  userId: string;
  extras?: Record<string, ServiceExtra>;
}) {
  const [order, setOrder] = useState<string[]>(() => services.map((s) => s.id));
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [visual, setVisual] = useState<DragVisual | null>(null);
  /**
   * Режим перестановки. Стрелки на телефоне занимают по 44px над каждой
   * карточкой, а нужны они раз в сто заходов — поэтому они не висят всегда,
   * а включаются кнопкой и рендерятся условно: спрятать их через `hidden`
   * значило бы оставить место занятым.
   */
  const [reordering, setReordering] = useState(false);

  const slotRefs = useRef(new Map<string, HTMLDivElement | null>());
  // Порядок читается из обработчиков окна, которые живут дольше одного рендера.
  const orderRef = useRef(order);
  orderRef.current = order;
  const pinnedRef = useRef(pinnedId);
  pinnedRef.current = pinnedId;

  useEffect(() => {
    const saved = loadLayout(userId);
    if (!saved) return;
    const knownIds = new Set(services.map((s) => s.id));
    const savedKnown = saved.order.filter((id) => knownIds.has(id));
    const missing = services.map((s) => s.id).filter((id) => !savedKnown.includes(id));
    setOrder([...savedKnown, ...missing]);
    setPinnedId(saved.pinnedId && knownIds.has(saved.pinnedId) ? saved.pinnedId : null);
    // Пересчитываем только когда меняется список сервисов с сервера, не на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, services.map((s) => s.id).join(",")]);

  const save = useCallback(
    (nextOrder: string[], nextPinned: string | null) => {
      try {
        localStorage.setItem(
          storageKey(userId),
          JSON.stringify({ order: nextOrder, pinnedId: nextPinned }),
        );
      } catch {
        // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем расположение.
      }
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

  return (
    <>
      {/* Перестановка нужна редко, поэтому переключатель тихий и только там,
          где нет перетаскивания мышью. */}
      <div className="mb-3 flex justify-end sm:hidden">
        <button
          type="button"
          onClick={() => setReordering((on) => !on)}
          aria-pressed={reordering}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
            reordering
              ? "border-cyan/40 bg-cyan/10 text-cyan"
              : "border-glass-brd text-text-2 hover:text-text-0"
          }`}
        >
          {reordering ? "Готово" : "Изменить порядок"}
        </button>
      </div>

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
              className={`relative rounded-2xl ${
                isDragged ? "border-2 border-dashed border-cyan/70 bg-cyan/5" : ""
              }`}
            >
              {reordering && (
                <div className="mb-2 flex items-center justify-end gap-1 px-1 sm:hidden">
                  <button
                    type="button"
                    onClick={() => moveByStep(service.id, -1)}
                    disabled={index === 0}
                    aria-label="Переместить выше"
                    className="rounded-lg p-1 text-text-2 hover:text-text-0 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveByStep(service.id, 1)}
                    disabled={index === displayed.length - 1}
                    aria-label="Переместить ниже"
                    className="rounded-lg p-1 text-text-2 hover:text-text-0 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              )}
              {/* Карточку не размонтируем: её размеры держат пустой слот ровно того же размера. */}
              <div className={isDragged ? "invisible" : undefined}>
                <ServiceCard
                  service={service}
                  badgeCount={extras?.[service.id]?.badgeCount}
                  extra={extras?.[service.id]?.extra}
                  isPinned={pinnedId === service.id}
                  onTogglePin={() => togglePin(service.id)}
                  dragHandleProps={{
                    onPointerDown: (e) => startDrag(service.id, e),
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </section>

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
            isPinned={pinnedId === draggedService.id}
          />
        </div>
      )}
    </>
  );
}
