/**
 * Ход викторины (VED-243): какой вопрос на экране, что выбрано и сколько
 * угадано. Чистая логика без React — её проверяют тесты, а компонент только
 * рисует состояние.
 *
 * Счёт живёт в сессии страницы: викторина — игра на пару минут, а не
 * экзамен, и хранить результаты незачем.
 */

export interface QuizQuestionLike {
  answer: string;
  options: readonly string[];
}

export interface QuizState {
  /** Номер вопроса на экране, с нуля. Равен числу вопросов — раунд окончен. */
  index: number;
  /** Выбранный вариант; `null` — ещё не ответили. */
  picked: string | null;
  /** Сколько угадано. */
  score: number;
}

export const INITIAL_QUIZ_STATE: QuizState = {
  index: 0,
  picked: null,
  score: 0,
};

/** Ответ засчитывается один раз: второй выбор после первого не меняет счёт. */
export function pickAnswer(
  state: QuizState,
  question: QuizQuestionLike,
  option: string,
): QuizState {
  if (state.picked !== null || !question.options.includes(option)) return state;
  return {
    ...state,
    picked: option,
    score: state.score + (option === question.answer ? 1 : 0),
  };
}

/** Дальше — только после ответа: пропуск вопроса счёт не спасает. */
export function nextQuestion(state: QuizState, total: number): QuizState {
  if (state.picked === null || state.index >= total) return state;
  return { ...state, index: state.index + 1, picked: null };
}

export function isFinished(state: QuizState, total: number): boolean {
  return state.index >= total;
}

export type OptionLook = "idle" | "correct" | "wrong" | "missed" | "dim";

/**
 * Как выглядит вариант после ответа: выбранный верный — `correct`, выбранный
 * неверный — `wrong`, верный, который не выбрали, — `missed` (его всё равно
 * показываем, иначе человек так и не узнает ответа), остальные гаснут.
 */
export function optionLook(
  option: string,
  question: QuizQuestionLike,
  picked: string | null,
): OptionLook {
  if (picked === null) return "idle";
  if (option === question.answer)
    return option === picked ? "correct" : "missed";
  return option === picked ? "wrong" : "dim";
}

/** Итог раунда словами: число и короткая оценка. */
export function quizVerdict(score: number, total: number): string {
  if (total <= 0) return "";
  const share = score / total;
  if (share === 1) return "Все стихи узнаны!";
  if (share >= 0.7) return "Отличный результат";
  if (share >= 0.4) return "Хорошее начало";
  return "Есть что перечитать";
}

/** Новое семя для следующего раунда. */
export function freshQuizSeed(random: () => number = Math.random): string {
  return Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
}
