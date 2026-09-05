/**
 * Калькулятор горячей панели.
 *
 * Состояние вынесено из компонента целиком: арифметика с накопителем и
 * повтором последней операции — это то место, где ошибаются, и проверять её
 * нажатиями по кнопкам дороже, чем вызовами функции.
 *
 * Обычный, а не инженерный: панель открывают, чтобы разделить пожертвование
 * на троих или посчитать метраж, а не считать логарифмы.
 */

export type CalcOperator = "+" | "−" | "×" | "÷";

export interface CalcState {
  /** Что на табло. Всегда строка: «0.» в процессе набора — не число. */
  display: string;
  /** Отложенное слева число и ожидающая операция. */
  pending: { value: number; operator: CalcOperator } | null;
  /** Табло показывает результат, а не набранное: следующая цифра начинает заново. */
  settled: boolean;
  /** Последняя операция для повтора по «=». */
  repeat: { operator: CalcOperator; value: number } | null;
}

export const initialCalcState: CalcState = {
  display: "0",
  pending: null,
  settled: false,
  repeat: null,
};

/** Сколько знаков помещается на табло: дальше строка ломает вёрстку панели. */
const MAX_DIGITS = 12;

export function calcDigit(state: CalcState, digit: string): CalcState {
  if (state.settled || state.display === "0")
    return { ...state, display: digit, settled: false };
  if (state.display.replace(/[^\d]/g, "").length >= MAX_DIGITS) return state;
  return { ...state, display: state.display + digit, settled: false };
}

export function calcDot(state: CalcState): CalcState {
  if (state.settled) return { ...state, display: "0.", settled: false };
  if (state.display.includes(".")) return state;
  return { ...state, display: `${state.display}.`, settled: false };
}

export function calcSign(state: CalcState): CalcState {
  if (state.display === "0") return state;
  return {
    ...state,
    display: state.display.startsWith("-")
      ? state.display.slice(1)
      : `-${state.display}`,
  };
}

export function calcClear(): CalcState {
  return { ...initialCalcState };
}

/** Стереть последний знак. На «0» и на результате — ничего: стирать нечего. */
export function calcBackspace(state: CalcState): CalcState {
  if (state.settled || state.display === "0") return state;
  const next = state.display.slice(0, -1);
  if (!next || next === "-") return { ...state, display: "0" };
  return { ...state, display: next };
}

export function calcOperator(
  state: CalcState,
  operator: CalcOperator,
): CalcState {
  const current = toNumber(state.display);
  // Две операции подряд — это правка выбора, а не второе действие: считать
  // нечего, меняем только знак ожидающей.
  if (state.pending && state.settled)
    return { ...state, pending: { ...state.pending, operator } };
  if (!state.pending)
    return {
      ...state,
      pending: { value: current, operator },
      settled: true,
      repeat: null,
    };
  const value = apply(state.pending.value, state.pending.operator, current);
  return {
    display: format(value),
    pending: { value, operator },
    settled: true,
    repeat: null,
  };
}

/**
 * Итог. Повторное «=» повторяет последнюю операцию — так считает любой
 * калькулятор на телефоне, и «×2 = = =» ожидаемо даёт степени двойки.
 */
export function calcEquals(state: CalcState): CalcState {
  if (state.pending) {
    const right = toNumber(state.display);
    const value = apply(state.pending.value, state.pending.operator, right);
    return {
      display: format(value),
      pending: null,
      settled: true,
      repeat: { operator: state.pending.operator, value: right },
    };
  }
  if (state.repeat) {
    const value = apply(
      toNumber(state.display),
      state.repeat.operator,
      state.repeat.value,
    );
    return { ...state, display: format(value), settled: true };
  }
  return { ...state, settled: true };
}

function toNumber(display: string): number {
  const value = Number(display);
  return Number.isFinite(value) ? value : 0;
}

function apply(left: number, operator: CalcOperator, right: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "−":
      return left - right;
    case "×":
      return left * right;
    case "÷":
      return right === 0 ? Number.NaN : left / right;
  }
}

/**
 * Число на табло.
 *
 * Деление даёт хвост в семнадцать знаков («0.30000000000000004»), поэтому
 * результат округляется до десяти значащих — это тот предел, за которым
 * двоичная дробь всё равно врёт. Деление на ноль — словами, а не «NaN»:
 * человек должен понять, что произошло.
 */
export function format(value: number): string {
  if (Number.isNaN(value)) return "На ноль не делится";
  if (!Number.isFinite(value)) return "Слишком много";
  const rounded = Number(value.toPrecision(10));
  return String(rounded);
}
