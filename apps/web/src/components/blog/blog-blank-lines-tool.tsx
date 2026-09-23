"use client";

import { useId, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import {
  BLOG_BLANK_LINES_DEFAULT_KEEP,
  BLOG_BLANK_LINES_KEEP_CHOICES,
  blogBlankLinesMessage,
  collapseBlankLines,
} from "./blog-blank-lines";

/**
 * Уборка лишних пустых строк в форме поста (VED-372).
 *
 * Заказчик просил «минимальный арсенал для редакции текста» и назвал первым
 * делом уборку пустых строк между частями текста — на его скриншоте текст
 * разорван дырой в пол-экрана.
 *
 * Три правила, на которых держится этот инструмент:
 *
 * 1. Он ручной. Текст поста — чужие слова; переписывать их молча при
 *    сохранении нельзя, даже «к лучшему».
 * 2. Он предсказуем. Сколько пустых строк оставить, человек выбирает сам, и
 *    видит это до нажатия, а не узнаёт по результату.
 * 3. Он обратим. Прежний текст лежит рядом, пока его не испортили руками:
 *    нажал, посмотрел, не понравилось — «Вернуть как было».
 *
 * Отмена исчезает, как только человек правит текст сам: возвращать «как
 * было» поверх новых слов значит стереть их, а этого кнопка с таким именем
 * не обещает.
 */
/** Словами, а не цифрами: список читается вслух вместе с подписью. */
const KEEP_LABELS: Record<number, string> = {
  0: "ни одной",
  1: "одну",
  2: "две",
};

export function BlogBlankLinesTool({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const keepId = useId();
  const [keep, setKeep] = useState<number>(BLOG_BLANK_LINES_DEFAULT_KEEP);
  /**
   * Итог последнего нажатия и текст, к которому он относится. Как только
   * человек правит поле сам, «Убрано 6 пустых строк» говорит уже не о том,
   * что он видит, — такую подпись прячем, а не оставляем висеть.
   */
  const [note, setNote] = useState<{ message: string; forValue: string } | null>(
    null,
  );
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
      message: blogBlankLinesMessage(result.removed),
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
          Убрать пустые строки
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
          {BLOG_BLANK_LINES_KEEP_CHOICES.map((choice) => (
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
