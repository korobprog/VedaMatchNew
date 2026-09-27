"use client";

import { Pause, Play, Square, Volume2 } from "lucide-react";
import {
  pauseDockSpeech,
  resumeDockSpeech,
  stopDockSpeech,
  useDockedSpeech,
} from "@/lib/speech-dock";

/**
 * Плавающий пульт озвучки (VED-569). Включили «Слушать» в Блог-ленте,
 * Образовании или Вдохновении и ушли со страницы — голос продолжает читать,
 * а поверх любой страницы висит пульт: что читается, «Пауза / Продолжить» и
 * «Стоп». Стоп останавливает речь и прячет пульт.
 *
 * Пульт портальный: чей диктор за ним стоит, он не знает — состояние и
 * команды приходят из `lib/speech-dock`. Пока кнопка, которой включили
 * чтение, видна на экране, пульт спрятан: две кнопки одного и того же рядом
 * только путают.
 *
 * Место — справа под шапкой, а не внизу: низ экрана занят полосой музыки и
 * радио, слева внизу — пузырь откреплённого плеера (VED-454), по центру
 * внизу — окно звонка и предупреждения. Слой z-40 — ниже шапки с её
 * меню и панелью горячих кнопок (z-50): открытое меню пульт не перекрывает.
 */
export function SpeechDock() {
  const session = useDockedSpeech();
  if (!session) return null;
  const speaking = session.status === "speaking";

  return (
    <div
      role="region"
      aria-label="Озвучка"
      className="fixed right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-glass-brd bg-bg-1/95 py-1 pr-1 pl-3 text-text-0 shadow-lg backdrop-blur-xl"
    >
      <Volume2 aria-hidden className="size-4 shrink-0 text-text-1" />
      <p
        aria-live="polite"
        className="min-w-0 max-w-[11rem] text-xs leading-tight sm:max-w-[16rem]"
      >
        <span className="block truncate text-text-1">
          {session.service}
          {speaking ? "" : " · пауза"}
        </span>
        <span className="block truncate font-medium">{session.title}</span>
      </p>
      <button
        type="button"
        onClick={speaking ? pauseDockSpeech : resumeDockSpeech}
        aria-label={speaking ? "Пауза озвучки" : "Продолжить озвучку"}
        title={speaking ? "Пауза" : "Продолжить"}
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-cyan text-text-0 transition-colors hover:bg-bg-2 motion-reduce:transition-none"
      >
        {speaking ? (
          <Pause aria-hidden className="size-4" fill="currentColor" />
        ) : (
          <Play aria-hidden className="size-4" fill="currentColor" />
        )}
      </button>
      <button
        type="button"
        onClick={stopDockSpeech}
        aria-label="Остановить озвучку"
        title="Стоп"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-glass-brd text-text-0 transition-colors hover:bg-bg-2 motion-reduce:transition-none"
      >
        <Square aria-hidden className="size-3.5" fill="currentColor" />
      </button>
    </div>
  );
}
