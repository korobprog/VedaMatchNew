"use client";

import { CircleAlert } from "lucide-react";
import type { BlogTextLimitState } from "./blog-text-limit";

/**
 * Подпись «сколько осталось» под полем текста поста (VED-371).
 *
 * Одна на обе формы — публикацию и правку: расходиться им нельзя, человек
 * пишет пост в одной, а дописывает в другой и вправе видеть тот же счёт.
 *
 * Пока места много — тихая справка `999 из 20000`; ближе к пределу она
 * становится обратным отсчётом, а при переборе говорит, сколько знаков
 * убрать. Цветом это не ограничивается: цвет здесь не единственный признак,
 * слова и значок меняются тоже.
 */
export function BlogTextCounter({
  id,
  state,
}: {
  id: string;
  state: BlogTextLimitState;
}) {
  return (
    <>
      <p
        id={id}
        /* Слова перебора — `text-text-0`, а не маджента: на светлой теме
           `--vm-magenta` даёт 4,46:1 и мелким текстом не годится (CLAUDE.md).
           Цвет тревоги несёт значок — ему по WCAG 1.4.11 хватает 3:1. */
        className={`mt-1 flex items-center gap-1 text-xs ${
          state.over ? "font-semibold text-text-0" : "text-text-1"
        }`}
      >
        {state.over && (
          <CircleAlert aria-hidden className="size-3.5 shrink-0 text-magenta" />
        )}
        {state.label}
      </p>
      {/* Объявление перебора — отдельной областью, которая есть в разметке
          всегда: `role="alert"`, навешенный на уже заполненный абзац,
          скринридеры читают через раз. Текст в ней постоянный, чтобы на
          каждый следующий знак не звучало новое объявление; точное число
          человек услышит из подписи поля (`aria-describedby`). */}
      <span role="alert" className="sr-only">
        {state.over ? "Текст длиннее, чем помещается в пост." : ""}
      </span>
    </>
  );
}
