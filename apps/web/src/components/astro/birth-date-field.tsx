"use client";

import {
  LEAP_FALLBACK_YEAR,
  MONTH_NAMES,
  daysInMonth,
  toParts,
  withPart,
  yearOptions,
  type BirthDateParts,
} from "./birth-date";

/**
 * Поле даты рождения: на телефоне нативный барабан, на десктопе три списка.
 *
 * Вынесено из формы своей карты, чтобы записи астролога вводились ровно так
 * же. Дата рождения — место, где неудобство запоминается: пикер открывается на
 * текущем годе, и до нужного его крутят десятилетиями.
 */

/** Общий вид поля — тот же, что у остальных полей форм Астрологии. */
export const ASTRO_FIELD =
  "min-h-[2.5rem] w-full rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-text-0 transition focus:border-mint-edge";

export function BirthDateField({
  idPrefix,
  value,
  onChange,
}: {
  /** Префикс id: на странице таких полей может быть несколько. */
  idPrefix: string;
  value: BirthDateParts;
  onChange: (next: BirthDateParts) => void;
}) {
  const years = yearOptions(new Date());
  const todayIso = new Date().toISOString().slice(0, 10);
  const minIso = `${years[years.length - 1]}-01-01`;
  const iso =
    value.day && value.month && value.year
      ? `${value.year}-${value.month}-${value.day}`
      : "";
  const maxDay = daysInMonth(
    Number(value.year) || LEAP_FALLBACK_YEAR,
    Number(value.month) || 1,
  );

  const set = (key: keyof BirthDateParts) => (next: string) =>
    onChange(withPart(value, key, next));

  return (
    <>
      {/* `required` нет ни у одного поля намеренно: спрятанное `display:none`
          поле с ним роняет отправку ошибкой «invalid form control is not
          focusable». Дату проверяет birthDateProblem при отправке. */}
      <input
        type="date"
        aria-label="Дата рождения"
        value={iso}
        max={todayIso}
        min={minIso}
        onChange={(event) => onChange(toParts(event.target.value))}
        className={`${ASTRO_FIELD} md:hidden`}
      />

      <div className="hidden grid-cols-[5rem_1fr_6rem] gap-2 md:grid">
        <span>
          <label htmlFor={`${idPrefix}-day`} className="sr-only">
            День рождения
          </label>
          <select
            id={`${idPrefix}-day`}
            value={value.day}
            onChange={(event) => set("day")(event.target.value)}
            className={ASTRO_FIELD}
          >
            <option value="">День</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => (
              <option key={day} value={String(day).padStart(2, "0")}>
                {day}
              </option>
            ))}
          </select>
        </span>

        <span>
          <label htmlFor={`${idPrefix}-month`} className="sr-only">
            Месяц рождения
          </label>
          <select
            id={`${idPrefix}-month`}
            value={value.month}
            onChange={(event) => set("month")(event.target.value)}
            className={ASTRO_FIELD}
          >
            <option value="">Месяц</option>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={String(index + 1).padStart(2, "0")}>
                {name}
              </option>
            ))}
          </select>
        </span>

        <span>
          <label htmlFor={`${idPrefix}-year`} className="sr-only">
            Год рождения
          </label>
          <select
            id={`${idPrefix}-year`}
            value={value.year}
            onChange={(event) => set("year")(event.target.value)}
            className={ASTRO_FIELD}
          >
            <option value="">Год</option>
            {years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </span>
      </div>
    </>
  );
}
