"use client";

import { useState } from "react";
import { BIRTH_TIME_SOURCES } from "./astro-copy";

/**
 * Свёрнутый по умолчанию помощник. Настоящий барьер здесь — не нежелание, а
 * незнание: человек не может ввести то, чего никогда не видел. Список источников
 * даёт конкретное действие вместо просьбы «постарайтесь вспомнить».
 */
export function BirthTimeHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl bg-black/[0.03] p-4 dark:bg-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-sm font-medium underline underline-offset-4"
      >
        Не знаете время рождения?
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm text-black/75 dark:text-white/75">
          <p>Чаще всего оно находится в одном из этих мест:</p>
          <ul className="space-y-1.5">
            {BIRTH_TIME_SOURCES.map((source) => (
              <li key={source} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{source}</span>
              </li>
            ))}
          </ul>
          <p>
            Можно отметить «время неизвестно» и вернуться позже. Карта построится
            и так, но без восходящего знака и домов — показывать их по
            выдуманному времени мы не станем.
          </p>
        </div>
      )}
    </div>
  );
}
