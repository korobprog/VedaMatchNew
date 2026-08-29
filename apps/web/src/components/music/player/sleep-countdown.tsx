"use client";

import { useEffect, useState } from "react";
import {
  SLEEP_TIMER_OFF,
  formatSleepLeft,
  sleepSecondsLeft,
} from "@/lib/music/sleep-timer";
import { useMusicPlayer } from "./player-provider";

/**
 * Отсчёт сон-таймера в полосе плеера.
 *
 * Состояние, а не кнопка: появляется, только когда таймер заведён, и потому
 * не занимает места в обычной полосе — на телефоне его там нет. Нажатие
 * отменяет таймер: это единственное, что человек хочет сделать, увидев
 * отсчёт не вовремя.
 */
export function MusicSleepCountdown() {
  const player = useMusicPlayer();
  const timer = player?.sleepTimer ?? SLEEP_TIMER_OFF;
  // Тикает «сейчас», а остаток выводится из него на рендере. Хранить сам
  // остаток состоянием значило бы держать в React то, что и так считается
  // из времени, — и объяснять линтеру, почему оно там оказалось.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.mode !== "at") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const left = sleepSecondsLeft(timer, now);

  if (!player || timer.mode === "off") return null;

  const label =
    timer.mode === "at" && left !== null
      ? formatSleepLeft(left)
      : "до конца записи";

  return (
    <button
      type="button"
      aria-label={`Сон-таймер: ${label}. Отменить`}
      onClick={() => player.setSleepTimer(SLEEP_TIMER_OFF)}
      className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-gold/40 px-2.5 text-[11px] font-semibold text-gold sm:h-7"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />
      </svg>
      {label}
    </button>
  );
}
