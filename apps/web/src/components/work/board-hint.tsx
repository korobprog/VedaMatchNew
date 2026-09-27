"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const STORAGE_KEY = "work:board-hint-folded";

/**
 * Пояснение над доской — «карточки собраны по дате…» — со своей кнопкой
 * «Свернуть» (VED-323). Прочитал раз — дальше оно только занимает три
 * строки над доской. Свёрнутое помнится на устройстве; вернуть — кнопкой
 * «Пояснение» на его месте.
 */
export function BoardHint({ children }: { children: ReactNode }) {
  const [folded, setFolded] = useState(false);

  // Хранилище есть только в браузере: читаем после монтирования, иначе
  // разметка сервера и первая отрисовка разойдутся.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    try {
      setFolded(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Приватный режим: пояснение просто развёрнуто.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function toggle(next: boolean) {
    setFolded(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, "1");
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Не запомнилось — свернётся до перезагрузки.
    }
  }

  if (folded)
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        aria-expanded={false}
        className="mb-3 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs text-text-2 hover:text-text-0"
      >
        <ChevronDown aria-hidden className="size-3.5" />
        Пояснение
      </button>
    );

  return (
    <div className="mb-3 flex items-start gap-1">
      <p className="min-w-0 flex-1 text-xs text-text-2">{children}</p>
      <button
        type="button"
        onClick={() => toggle(true)}
        aria-expanded
        aria-label="Свернуть пояснение"
        title="Свернуть пояснение"
        className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
      >
        <ChevronUp aria-hidden className="size-4" />
      </button>
    </div>
  );
}
