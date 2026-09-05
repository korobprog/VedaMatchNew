"use client";

import { useState } from "react";
import {
  calcBackspace,
  calcClear,
  calcDigit,
  calcDot,
  calcEquals,
  calcOperator,
  calcSign,
  initialCalcState,
} from "./calculator";

/**
 * Клавиатура калькулятора. Вся арифметика — в `calculator.ts`, здесь только
 * нажатия: так считалку можно проверить числами, а не кликами.
 *
 * Табло — `output` с `aria-live`: результат меняется без перезагрузки, и
 * скринридер должен его прочитать, а не молчать после «=».
 */
export function CalculatorPad({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState(initialCalcState);

  /* Ряды заданы явно, а не собираются из индексов: сетка 4×5 читается
     глазами, а вычисление «какая операция стоит справа от этого ряда» —
     нет, и ошибиться в нём легче, чем заметить. */
  const rows: Array<Array<{ key: string; label: string; press: () => void; kind: "digit" | "operator" }>> =
    [
      [
        { key: "7", label: "7", kind: "digit", press: () => setState(calcDigit(state, "7")) },
        { key: "8", label: "8", kind: "digit", press: () => setState(calcDigit(state, "8")) },
        { key: "9", label: "9", kind: "digit", press: () => setState(calcDigit(state, "9")) },
        { key: "mul", label: "×", kind: "operator", press: () => setState(calcOperator(state, "×")) },
      ],
      [
        { key: "4", label: "4", kind: "digit", press: () => setState(calcDigit(state, "4")) },
        { key: "5", label: "5", kind: "digit", press: () => setState(calcDigit(state, "5")) },
        { key: "6", label: "6", kind: "digit", press: () => setState(calcDigit(state, "6")) },
        { key: "sub", label: "−", kind: "operator", press: () => setState(calcOperator(state, "−")) },
      ],
      [
        { key: "1", label: "1", kind: "digit", press: () => setState(calcDigit(state, "1")) },
        { key: "2", label: "2", kind: "digit", press: () => setState(calcDigit(state, "2")) },
        { key: "3", label: "3", kind: "digit", press: () => setState(calcDigit(state, "3")) },
        { key: "add", label: "+", kind: "operator", press: () => setState(calcOperator(state, "+")) },
      ],
    ];

  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3">
      <output
        aria-live="polite"
        aria-label="Результат"
        className="mb-2 block truncate rounded-lg bg-bg-0 px-3 py-2 text-right font-mono text-lg text-text-0"
      >
        {state.display}
      </output>

      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" onClick={() => setState(calcClear())} className={keyClass}>
          C
        </button>
        <button
          type="button"
          aria-label="Стереть знак"
          onClick={() => setState(calcBackspace(state))}
          className={keyClass}
        >
          ⌫
        </button>
        <button
          type="button"
          aria-label="Сменить знак"
          onClick={() => setState(calcSign(state))}
          className={keyClass}
        >
          ±
        </button>
        <button
          type="button"
          onClick={() => setState(calcOperator(state, "÷"))}
          className={operatorClass}
        >
          ÷
        </button>

        {rows.flat().map((key) => (
          <button
            key={key.key}
            type="button"
            onClick={key.press}
            className={key.kind === "operator" ? operatorClass : keyClass}
          >
            {key.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setState(calcDigit(state, "0"))}
          className={`${keyClass} col-span-2`}
        >
          0
        </button>
        <button type="button" onClick={() => setState(calcDot(state))} className={keyClass}>
          ,
        </button>
        <button
          type="button"
          aria-label="Посчитать"
          onClick={() => setState(calcEquals(state))}
          className="flex h-11 items-center justify-center rounded-lg border border-mint-edge bg-mint text-lg font-semibold text-on-mint"
        >
          =
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-2 hover:text-text-0"
      >
        Закрыть
      </button>
    </div>
  );
}

const keyClass =
  "flex h-11 items-center justify-center rounded-lg border border-glass-brd bg-white/4 text-base text-text-0 transition-colors hover:bg-white/8";
const operatorClass =
  "flex h-11 items-center justify-center rounded-lg border border-glass-brd bg-white/8 text-base font-semibold text-gold transition-colors hover:bg-white/12";
