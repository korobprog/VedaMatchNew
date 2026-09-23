"use client";

import { useId, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { collapseBlankLines, type LibraryLocale } from "@vedamatch/shared";
import {
  BODY_BLANK_LINES_DEFAULT_KEEP,
  BODY_BLANK_LINES_KEEP_CHOICES,
  BODY_BLANK_LINES_KEEP_LABELS,
  bodyBlankLinesMessage,
  type BodyBlankLinesKeep,
} from "./body-blank-lines";
import { t } from "./i18n";

/**
 * Уборка лишних пустых строк под полем текста статьи и катхи (VED-372).
 *
 * То же поведение, что у формы поста блог-ленты, — заказчик просил «то же
 * самое». Компонент свой, а не блоговый: контракт запрещает сервису брать
 * компоненты чужого, а у «Образования» ещё и два языка интерфейса. Общая у
 * них чистая функция уборки из `@vedamatch/shared`.
 *
 * Правила те же:
 *
 * 1. Ручной. Текст материала — чужие слова; молча переписывать их при
 *    сохранении нельзя, даже «к лучшему».
 * 2. Предсказуемый. Сколько пустых строк оставить, человек выбирает сам и
 *    видит это до нажатия.
 * 3. Обратимый. Прежний текст лежит рядом, пока его не поправили руками:
 *    нажал, посмотрел, не понравилось — «Вернуть как было».
 *
 * Отмена исчезает, как только человек правит текст сам: вернуть «как было»
 * поверх новых слов значит стереть их.
 */
export function BodyBlankLinesTool({
  locale,
  value,
  onChange,
  disabled = false,
}: {
  locale: LibraryLocale;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const keepId = useId();
  const [keep, setKeep] = useState<BodyBlankLinesKeep>(
    BODY_BLANK_LINES_DEFAULT_KEEP,
  );
  /**
   * Итог последнего нажатия и текст, к которому он относится. Как только
   * поле поправили руками, подпись говорит уже не о том, что видно, — её
   * прячем, а не оставляем висеть.
   */
  const [note, setNote] = useState<{ message: string; forValue: string } | null>(
    null,
  );
  /**
   * Что было до уборки и что получилось. Пока `after` совпадает с полем,
   * отменять безопасно — человек с тех пор ничего не дописал.
   */
  const [applied, setApplied] = useState<{
    before: string;
    after: string;
  } | null>(null);

  const canUndo = applied !== null && applied.after === value;

  function clean() {
    const result = collapseBlankLines(value, keep);
    setNote({
      message: bodyBlankLinesMessage(locale, result.removed),
      forValue: result.text,
    });
    if (result.text === value) {
      // Ничего не изменилось — и старую отмену держать нельзя: она вернула
      // бы текст к позапрошлому состоянию.
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
    setNote({ message: t(locale, "blank.undone"), forValue: applied.before });
  }

  return (
    <div className="mt-2 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button
          type="button"
          onClick={clean}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:border-cyan/60 disabled:opacity-60"
        >
          <Eraser aria-hidden className="size-4" />
          {t(locale, "blank.clean")}
        </button>
        {/* Подпись договаривает за список: «оставлять пустых строк: одну»
            читается целиком и вслух, а «оставлять: 1» — нет. */}
        <label htmlFor={keepId} className="text-xs text-text-1">
          {t(locale, "blank.keep")}
        </label>
        <select
          id={keepId}
          value={keep}
          onChange={(event) =>
            setKeep(Number(event.target.value) as BodyBlankLinesKeep)
          }
          disabled={disabled}
          className="min-h-11 rounded-lg border border-glass-brd bg-bg-1 px-2 text-xs text-text-0 disabled:opacity-60"
        >
          {BODY_BLANK_LINES_KEEP_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {t(locale, BODY_BLANK_LINES_KEEP_LABELS[choice])}
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
            {t(locale, "blank.undo")}
          </button>
        )}
      </div>
      {/* Живая область на месте с самого начала: скринридер читает итог
          уборки, а не догадывается о нём по изменившемуся полю. */}
      <p role="status" className="mt-1 min-h-4 text-xs text-text-1">
        {note?.forValue === value ? note.message : null}
      </p>
    </div>
  );
}
