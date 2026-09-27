"use client";

import { useId, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { collapseBlankLines } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/** Сколько пустых строк можно оставить между куплетами. */
const KEEP_CHOICES = [0, 1] as const;

/**
 * По умолчанию — одна: в бхаджане куплеты разделяет пустая строка, и убрать
 * её совсем значит слепить текст в один столбец.
 */
const DEFAULT_KEEP = 1;

export function musicBlankLinesMessage(removed: number): string {
  if (removed <= 0) return "Лишних пустых строк не нашлось.";
  return `${plural(removed, "Убрана", "Убрано", "Убрано")} ${removed} ${plural(
    removed,
    "пустая строка",
    "пустые строки",
    "пустых строк",
  )}.`;
}

/**
 * Уборка лишних пустых строк в тексте записи Медиатеки (VED-477: «сделай
 * редактор — уменьшение количества строк, как ты уже делал, для создания
 * текста треков»). Своя копия инструмента из формы поста Блог-ленты
 * (VED-372): по контракту сервис не импортирует компоненты другого, общая —
 * только чистая `collapseBlankLines` из `@vedamatch/shared`.
 *
 * Те же три правила: ручной (текст бхаджана молча не переписывается),
 * предсказуемый (сколько пустых строк оставить, видно до нажатия) и
 * обратимый («Вернуть как было», пока текст не правили руками).
 */
/** Словами, а не цифрами: список читается вслух вместе с подписью. */
const KEEP_LABELS: Record<number, string> = {
  0: "ни одной",
  1: "одну",
};

export function MusicBlankLinesTool({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Какое поле убирает кнопка: их в редакторе три рядом. */
  label: string;
  disabled?: boolean;
}) {
  const keepId = useId();
  const [keep, setKeep] = useState<number>(DEFAULT_KEEP);
  /**
   * Итог последнего нажатия и текст, к которому он относится. Как только
   * человек правит поле сам, «Убрано 6 пустых строк» говорит уже не о том,
   * что он видит, — такую подпись прячем, а не оставляем висеть.
   */
  const [note, setNote] = useState<{
    message: string;
    forValue: string;
  } | null>(null);
  /**
   * Что было до уборки и что получилось. Пара, а не одна строка: пока
   * `after` совпадает с полем, отменять безопасно — человек с тех пор ничего
   * не дописал.
   */
  const [applied, setApplied] = useState<{
    before: string;
    after: string;
  } | null>(null);

  const canUndo = applied !== null && applied.after === value;

  function clean() {
    const result = collapseBlankLines(value, keep);
    setNote({
      message: musicBlankLinesMessage(result.removed),
      forValue: result.text,
    });
    if (result.text === value) {
      // Ничего не изменилось — отменять нечего, и старую отмену держать
      // нельзя: она вернула бы текст к позапрошлому состоянию.
      setApplied(null);
      return;
    }
    setApplied({ before: value, after: result.text });
    onChange(result.text);
  }

  function undo() {
    if (!applied) return;
    onChange(applied.before);
    setApplied(null);
    setNote({ message: "Текст возвращён как был.", forValue: applied.before });
  }

  return (
    <div className="mt-2 rounded-lg border border-glass-brd bg-bg-1 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button
          type="button"
          onClick={clean}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-cyan/60 disabled:opacity-60"
        >
          <Eraser aria-hidden className="size-4" />
          <span>
            Убрать пустые строки
            <span className="sr-only">: {label}</span>
          </span>
        </button>
        {/* Подпись договаривает за список: «оставлять пустых строк: одну»
            читается целиком и вслух, а «оставлять: 1» — нет. */}
        <label htmlFor={keepId} className="text-xs text-text-1">
          оставлять пустых строк
        </label>
        <select
          id={keepId}
          value={keep}
          onChange={(event) => setKeep(Number(event.target.value))}
          disabled={disabled}
          className="min-h-11 rounded-lg border border-glass-brd bg-bg-1 px-2 text-xs text-text-0 disabled:opacity-60"
        >
          {KEEP_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {KEEP_LABELS[choice]}
            </option>
          ))}
        </select>
        {canUndo && (
          <button
            type="button"
            onClick={undo}
            disabled={disabled}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-magenta/60 disabled:opacity-60"
          >
            <Undo2 aria-hidden className="size-4" />
            Вернуть как было
          </button>
        )}
      </div>
      {/* Живая область на месте: скринридер читает итог уборки, а не
          догадывается о нём по изменившемуся полю. */}
      <p role="status" className="mt-1 min-h-4 text-xs text-text-1">
        {note?.forValue === value ? note.message : null}
      </p>
    </div>
  );
}
