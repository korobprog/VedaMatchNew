"use client";

import { useEffect } from "react";
import { Radio } from "lucide-react";
import { useMusicRadio } from "./radio-provider";
import { radioListenersLabel } from "./radio-sync";

/**
 * Кнопка «Радио» на странице Медиатеки (VED-437): включает и выключает
 * эфир, рядом — сколько человек слушает прямо сейчас.
 */
export function MusicRadioButton({ className = "" }: { className?: string }) {
  const radio = useMusicRadio();
  const refresh = radio?.refreshListeners;

  // Счётчик виден и до включения: «слушают 12» — повод включить.
  useEffect(() => {
    refresh?.();
  }, [refresh]);

  // Гостю плеера нет — и радио тоже (провайдер только у вошедшего).
  if (!radio) return null;
  const { active, listeners } = radio;

  return (
    <button
      type="button"
      onClick={active ? radio.stop : radio.start}
      aria-pressed={active}
      // Рост и шрифт — как у вкладок «Всё / Традиционное» (VED-516).
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
        active
          ? "border-magenta/40 bg-magenta/10 text-text-0"
          : "border-glass-brd text-text-1 hover:text-text-0"
      } ${className}`}
    >
      <Radio aria-hidden className="size-4" />
      Радио
      {listeners !== null && listeners > 0 && (
        <span className="font-mono text-[11px] text-text-2">
          <span className="sr-only">, </span>
          {listeners}
          <span className="sr-only">
            {" "}
            {radioListenersLabel(listeners).replace(/^\d+ /, "")}
          </span>
        </span>
      )}
    </button>
  );
}
