"use client";

import { useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import {
  BLOG_BLANK_LINES_REMOVE_CHOICES,
  blogBlankLinesChoiceLabel,
  blogBlankLinesMessage,
  removeBlankLines,
  type BlogBlankLinesRemove,
} from "./blog-blank-lines";
import { BlogMenuButton, blogMenuOptionClass } from "./blog-menu";

/**
 * Уборка лишних пустых строк в форме поста (VED-372, VED-633).
 *
 * Заказчик просил «минимальный арсенал для редакции текста» и назвал первым
 * делом уборку пустых строк между частями текста — на его скриншоте текст
 * разорван дырой в пол-экрана. Потом (VED-633) — «убери развёрнутое поле
 * редакции, оставь одну кнопку»: теперь это одна кнопка под полем текста,
 * а сколько строк убрать из каждого промежутка — 1, 2, 3 или все — в её
 * меню.
 *
 * Три правила, на которых держится этот инструмент:
 *
 * 1. Он ручной. Текст поста — чужие слова; переписывать их молча при
 *    сохранении нельзя, даже «к лучшему».
 * 2. Он предсказуем. Пункт меню называет действие целиком («Убрать 2
 *    строки»), и человек знает, что будет, до нажатия.
 * 3. Он обратим. Прежний текст лежит рядом, пока его не испортили руками:
 *    нажал, посмотрел, не понравилось — «Вернуть как было».
 *
 * Отмена исчезает, как только человек правит текст сам: возвращать «как
 * было» поверх новых слов значит стереть их, а этого кнопка с таким именем
 * не обещает.
 */
export function BlogBlankLinesTool({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
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

  function clean(count: BlogBlankLinesRemove) {
    const result = removeBlankLines(value, count);
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
    // Отмена возвращает к тому, что было до первой уборки подряд: «убрал
    // одну, потом ещё одну» отменяется одним нажатием целиком.
    setApplied({ before: canUndo ? applied.before : value, after: result.text });
    onChange(result.text);
  }

  function undo() {
    if (!applied) return;
    onChange(applied.before);
    setApplied(null);
    setNote({ message: "Текст возвращён как был.", forValue: applied.before });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {canUndo && (
          <button
            type="button"
            onClick={undo}
            disabled={disabled}
            aria-label="Вернуть как было"
            title="Вернуть как было"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-glass-brd text-text-1 transition-colors hover:border-magenta/60 hover:text-text-0 disabled:opacity-60"
          >
            <Undo2 aria-hidden className="size-4" />
          </button>
        )}
        <BlogMenuButton
          label="Убрать пустые строки"
          menuLabel="Сколько пустых строк убрать между абзацами"
          icon={<Eraser aria-hidden className="size-4" />}
          text="Убрать пустые строки"
          disabled={disabled}
        >
          {(close) =>
            BLOG_BLANK_LINES_REMOVE_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => {
                  close();
                  clean(choice);
                }}
                className={blogMenuOptionClass(false)}
              >
                {blogBlankLinesChoiceLabel(choice)}
              </button>
            ))
          }
        </BlogMenuButton>
      </div>
      {/* Живая область на месте: скринридер читает итог уборки, а не
          догадывается о нём по изменившемуся полю. Пустая — нулевой высоты
          и места в форме не занимает. */}
      <p role="status" className="text-right text-xs text-text-1">
        {note?.forValue === value ? note.message : null}
      </p>
    </div>
  );
}
