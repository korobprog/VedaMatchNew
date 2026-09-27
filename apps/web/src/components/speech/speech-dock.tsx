"use client";

import { Pause, Play, Square } from "lucide-react";
import {
  pauseDockSpeech,
  resumeDockSpeech,
  stopDockSpeech,
} from "@/lib/speech-dock";
import { useDockedSpeech } from "@/lib/use-speech-dock";

/**
 * Плавающий пульт озвучки (VED-569). Включили «Слушать» в Блог-ленте,
 * Образовании или Вдохновении и ушли со страницы — голос продолжает читать,
 * а поверх любой страницы висит пульт из двух кнопок: «Пауза / Продолжить» и
 * «Стоп». Стоп останавливает речь и прячет пульт. Название того, что
 * читается, — только для скринридера и во всплывающей подсказке: широкая
 * плашка с текстом закрывала заголовок страницы, а заказчик просил именно
 * две кнопки (VED-569, доработка).
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
/**
 * Кнопки пульта — того же вида, что кнопка озвучки на панели Блог-ленты
 * главной (`iconButton` в `blog-home-widget.tsx`): квадрат со скруглением и
 * рамкой. Дублируется, а не импортируется: пульт портальный.
 */
const dockButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border text-text-0 transition-colors hover:bg-bg-2 motion-reduce:transition-none";

export function SpeechDock() {
  const session = useDockedSpeech();
  if (!session) return null;
  const speaking = session.status === "speaking";

  return (
    <div
      role="region"
      aria-label="Озвучка"
      title={`${session.service}: ${session.title}`}
      className="fixed right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-40 flex items-center gap-1.5 rounded-xl border border-glass-brd bg-bg-1/95 p-1.5 shadow-lg backdrop-blur-xl"
    >
      <p aria-live="polite" className="sr-only">
        {session.service}
        {speaking ? "" : " · пауза"}: {session.title}
      </p>
      <button
        type="button"
        onClick={speaking ? pauseDockSpeech : resumeDockSpeech}
        aria-label={speaking ? "Пауза озвучки" : "Продолжить озвучку"}
        title={speaking ? "Пауза" : "Продолжить"}
        className={`${dockButton} border-cyan`}
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
        className={`${dockButton} border-glass-brd hover:border-magenta/60`}
      >
        <Square aria-hidden className="size-3.5" fill="currentColor" />
      </button>
    </div>
  );
}
