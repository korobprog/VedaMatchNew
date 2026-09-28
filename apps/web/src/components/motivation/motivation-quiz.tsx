"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { MotivationQuizDto } from "@vedamatch/shared";
import {
  INITIAL_QUIZ_STATE,
  freshQuizSeed,
  isFinished,
  nextQuestion,
  optionLook,
  pickAnswer,
  quizVerdict,
  type OptionLook,
} from "./quiz-session";

/**
 * Викторина (VED-243): иллюстрация к шлоке Бхагавад-гиты и четыре номера
 * стиха. Вопрос один на всю игру — «какой стих отображает картинка?», — и
 * на экране его не пишут: он понятен из самого экрана. Для скринридера он
 * есть — подписью группы вариантов.
 *
 * Ответ показывается движением: верный вариант «подпрыгивает», неверный
 * вздрагивает, над картинкой — плашка «Верно» или «Неверно». Движение
 * выключается вместе с `prefers-reduced-motion`; цвет, значок и надпись
 * остаются.
 */
export function MotivationQuiz({ quiz }: { quiz: MotivationQuizDto }) {
  const router = useRouter();
  const [state, setState] = useState(INITIAL_QUIZ_STATE);
  const nextRef = useRef<HTMLButtonElement>(null);
  const total = quiz.questions.length;
  const question = quiz.questions[state.index];

  /* После ответа фокус — на «Дальше»: выбранный вариант становится
     неактивным, и фокус с него иначе падал бы в начало страницы. */
  useEffect(() => {
    if (state.picked !== null) nextRef.current?.focus();
  }, [state.picked]);

  function newRound() {
    router.push(`/motivation/quiz?seed=${freshQuizSeed()}`);
  }

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-glass-brd bg-bg-1 p-6 text-center">
        <p className="font-display text-lg text-text-0">
          Иллюстраций к стихам Гиты пока нет
        </p>
        <p className="mt-2 text-sm text-text-1">
          Викторина собирается из опубликованных картинок к шлокам Бхагавад-гиты
          с номером стиха. Они появятся — появятся и вопросы.
        </p>
        <Link
          href="/motivation"
          className="btn-mint mt-4 inline-block rounded-xl px-4 py-2 text-sm font-semibold"
        >
          К ленте
        </Link>
      </div>
    );
  }

  if (isFinished(state, total) || !question) {
    return (
      <div className="rounded-2xl border border-glass-brd bg-bg-1 p-6 text-center">
        <p className="font-display text-2xl font-bold text-text-0">
          <span className="font-mono">{state.score}</span> из{" "}
          <span className="font-mono">{total}</span>
        </p>
        <p className="mt-1 text-sm text-text-1">
          {quizVerdict(state.score, total)}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={newRound}
            className="btn-mint rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Ещё раунд
          </button>
          <Link
            href="/motivation"
            className="rounded-xl border border-glass-brd px-5 py-2.5 text-sm font-semibold text-text-0 hover:bg-bg-2"
          >
            К ленте
          </Link>
        </div>
      </div>
    );
  }

  const answered = state.picked !== null;
  const guessed = state.picked === question.answer;
  const last = state.index + 1 >= total;

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-text-1">
        <span>
          Вопрос <span className="font-mono">{state.index + 1}</span> из{" "}
          <span className="font-mono">{total}</span>
        </span>
        <span>
          Угадано: <span className="font-mono text-text-0">{state.score}</span>
        </span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-2xl border border-glass-brd bg-bg-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={question.id}
          src={question.imageUrl}
          // Описание не выдаёт ответ: текст стиха в alt — это подсказка.
          alt="Иллюстрация к стиху Бхагавад-гиты"
          className="mx-auto max-h-[55dvh] w-full object-contain"
        />
        {answered && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
          >
            <span
              className={`${guessed ? "vm-quiz-pop border-lime" : "vm-quiz-shake border-mark-rework"} flex items-center gap-1.5 rounded-full border-2 bg-bg-0 px-4 py-1.5 font-display text-base font-bold ${guessed ? "text-lime" : "text-mark-rework"}`}
            >
              {guessed ? (
                <Check className="size-5" aria-hidden />
              ) : (
                <X className="size-5" aria-hidden />
              )}
              {guessed ? "Верно!" : "Неверно"}
            </span>
          </div>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="sr-only">Какой стих отображает эта картинка?</legend>
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((option) => {
            const look = optionLook(option, question, state.picked);
            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                onClick={() =>
                  setState((current) => pickAnswer(current, question, option))
                }
                aria-label={`Стих ${option}${lookLabel(look)}`}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 font-mono text-xl font-semibold transition-colors ${optionClass(look)}`}
              >
                {look === "correct" || look === "missed" ? (
                  <Check className="size-5 shrink-0 text-lime" aria-hidden />
                ) : look === "wrong" ? (
                  <X className="size-5 shrink-0 text-mark-rework" aria-hidden />
                ) : null}
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Итог ответа словами — для скринридера и для тех, у кого движение
          выключено: цвет сам по себе ответа не сообщает. */}
      <p role="status" className="mt-3 min-h-5 text-center text-sm text-text-1">
        {answered
          ? guessed
            ? `Верно — это стих ${question.answer}.`
            : `Неверно. Это стих ${question.answer}.`
          : ""}
      </p>

      {answered && (
        <div className="mt-2">
          {question.text && (
            <blockquote className="rounded-2xl border border-glass-brd bg-bg-1 p-4 text-sm leading-relaxed text-text-0">
              <p className="whitespace-pre-line">{question.text}</p>
              <footer className="mt-2 text-xs text-text-2">
                Бхагавад-гита,{" "}
                <span className="font-mono">{question.answer}</span>
              </footer>
            </blockquote>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/motivation?post=${encodeURIComponent(question.slug)}`}
              className="text-sm font-medium text-cyan underline-offset-4 hover:underline"
            >
              Открыть в ленте
            </Link>
            <button
              ref={nextRef}
              type="button"
              onClick={() =>
                setState((current) => nextQuestion(current, total))
              }
              className="btn-mint rounded-xl px-6 py-2.5 text-sm font-semibold"
            >
              {last ? "Итоги" : "Дальше"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function lookLabel(look: OptionLook): string {
  switch (look) {
    case "correct":
      return " — ваш ответ, верно";
    case "wrong":
      return " — ваш ответ, неверно";
    case "missed":
      return " — правильный ответ";
    default:
      return "";
  }
}

/**
 * Цвет варианта после ответа. Выбранный верный ещё и «подпрыгивает»,
 * выбранный неверный — вздрагивает; погасшие остаются читаемыми, но
 * отступают на второй план.
 */
function optionClass(look: OptionLook): string {
  switch (look) {
    case "correct":
      return "vm-quiz-pop border-lime bg-bg-1 text-text-0";
    case "missed":
      return "border-lime bg-bg-1 text-text-0";
    case "wrong":
      return "vm-quiz-shake border-mark-rework bg-bg-1 text-text-0";
    case "dim":
      return "border-glass-brd bg-bg-1 text-text-2";
    default:
      return "border-glass-brd bg-bg-1 text-text-0 hover:border-cyan hover:bg-bg-2";
  }
}
