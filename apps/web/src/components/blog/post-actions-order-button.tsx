"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";
import { useDismissable } from "@/lib/use-dismissable";
import {
  POST_ACTION_LABELS,
  movePostAction,
  writePostActionsOrder,
  type PostAction,
} from "./post-actions-order";
import { usePostActionsOrder } from "./use-post-actions-order";

/**
 * Кнопка «Порядок кнопок» рядом с «Поделиться» на странице поста (VED-509):
 * переставляет кнопки под постом стрелками. Порядок один на всю Блог-ленту —
 * лента, страница автора и страница поста перестраиваются вместе.
 */
export function PostActionsOrderButton() {
  const order = usePostActionsOrder();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  function move(id: PostAction, direction: -1 | 1) {
    const next = movePostAction(order, id, direction);
    writePostActionsOrder(next);
    setStatus(
      `${POST_ACTION_LABELS[id]}: ${next.indexOf(id) + 1} из ${next.length}`,
    );
  }

  // Без своей точки отсчёта: панель раскрывается у правого края ряда
  // шапки (он — `relative`). От самой кнопки она в 288 точек уезжала бы за
  // левый край телефона — справа от кнопки ещё «Поделиться».
  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="blog-post-actions-order"
        aria-label="Порядок кнопок под постом"
        title="Порядок кнопок"
        className={`inline-flex size-11 items-center justify-center rounded-lg border text-text-1 hover:border-cyan/60 ${
          open ? "border-cyan" : "border-glass-brd"
        }`}
      >
        <ArrowDownUp aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id="blog-post-actions-order"
          role="group"
          aria-label="Порядок кнопок под постом"
          className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          <p className="px-1 pb-1 text-xs text-text-1">
            Порядок кнопок под постами — стрелками. Действует во всей ленте.
            Правка, закрепление и удаление видны только там, где они вам
            доступны.
          </p>
          <ol className="flex flex-col">
            {order.map((id, at) => (
              <li key={id} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate px-1 text-sm text-text-0">
                  {POST_ACTION_LABELS[id]}
                </span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={at === 0}
                  aria-label={`${POST_ACTION_LABELS[id]}: левее`}
                  className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ChevronUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={at === order.length - 1}
                  aria-label={`${POST_ACTION_LABELS[id]}: правее`}
                  className="inline-flex size-11 items-center justify-center rounded-lg text-text-1 hover:text-text-0 disabled:opacity-30"
                >
                  <ChevronDown aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ol>
          <p role="status" className="sr-only">
            {status}
          </p>
        </div>
      )}
    </div>
  );
}
