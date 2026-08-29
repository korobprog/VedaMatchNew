"use client";

import { useEffect, useState } from "react";
import {
  SLEEP_MINUTES,
  SLEEP_TIMER_OFF,
  formatSleepLeft,
  sleepSecondsLeft,
  sleepTimerAfterMinutes,
} from "@/lib/music/sleep-timer";
import { useMusicPlayer } from "./player/player-provider";

/**
 * Сон-таймер. См. docs/music-service-plan.md, этап 9.
 *
 * Живёт на карточке записи, а не в полосе плеера. На телефоне полоса и так
 * несёт одиннадцать органов управления, и шестая кнопка в правой группе
 * вернула бы наложение, которое недавно чинили. А ставят таймер один раз —
 * там же, откуда включают запись на ночь.
 *
 * Заведённый таймер виден в самой полосе отсчётом: искать, включён ли он,
 * возвращаясь на карточку, человек не должен.
 */
export function MusicSleepTimerButton() {
  const player = useMusicPlayer();
  const [open, setOpen] = useState(false);
  const timer = player?.sleepTimer ?? SLEEP_TIMER_OFF;

  // Тикает «сейчас», а остаток выводится из него на рендере. Хранить сам
  // остаток состоянием значило бы держать в React то, что и так считается
  // из времени.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.mode !== "at") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const left = sleepSecondsLeft(timer, now);

  if (!player) return null;

  const shell =
    "flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors";
  const armed = timer.mode !== "off";

  const choose = (next: Parameters<typeof player.setSleepTimer>[0]) => {
    player.setSleepTimer(next);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`${shell} ${
          armed
            ? "border-gold/40 text-gold"
            : "border-glass-brd text-text-1 hover:text-text-0"
        }`}
      >
        <MoonIcon />
        {timer.mode === "at" && left !== null
          ? `Выключится через ${formatSleepLeft(left)}`
          : timer.mode === "end-of-track"
            ? "Выключится в конце записи"
            : "Выключить через…"}
      </button>

      {open && (
        <div
          role="group"
          aria-label="Через сколько выключить"
          className="glass flex flex-wrap gap-1.5 rounded-xl p-2"
        >
          {SLEEP_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => choose(sleepTimerAfterMinutes(minutes, Date.now()))}
              className="h-9 rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0"
            >
              {minutes} мин
            </button>
          ))}
          <button
            type="button"
            onClick={() => choose({ mode: "end-of-track" })}
            className="h-9 rounded-lg border border-glass-brd px-3 text-sm font-semibold text-text-1 hover:text-text-0"
          >
            В конце записи
          </button>
          {armed && (
            <button
              type="button"
              onClick={() => choose(SLEEP_TIMER_OFF)}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-text-2 hover:text-magenta"
            >
              Отменить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 text-gold"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />
    </svg>
  );
}
