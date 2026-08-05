"use client";

import { ReactNode, useEffect, useId, useState } from "react";

/**
 * Строка анкеты в стиле «поле → значение / Указать». Значение редактируется
 * в шторке и сохраняется отдельно от остальных полей.
 */
interface FieldRowProps {
  label: string;
  /** Текущее значение; null — поле не заполнено */
  value: string | null;
  hint?: string;
  children: (close: () => void) => ReactNode;
}

export function UnionFieldRow({ label, value, hint, children }: FieldRowProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-4 border-b border-glass-brd px-1 py-3 text-left transition last:border-b-0 hover:bg-bg-1"
      >
        <span className="text-sm text-text-0">{label}</span>
        <span
          className={
            value ? "text-right text-sm text-text-1" : "text-sm font-medium text-cyan"
          }
        >
          {value ?? "Указать"}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-glass-brd bg-bg-0 p-5 sm:rounded-3xl"
          >
            <h2 id={titleId} className="text-base font-semibold text-text-0">
              {label}
            </h2>
            {hint && <p className="mt-1 text-xs text-text-2">{hint}</p>}
            <div className="mt-4">{children(() => setOpen(false))}</div>
          </div>
        </div>
      )}
    </>
  );
}

const optionClass = (active: boolean) =>
  active
    ? "w-full rounded-xl border border-cyan bg-cyan/10 px-3 py-2.5 text-left text-sm text-text-0"
    : "w-full rounded-xl border border-glass-brd px-3 py-2.5 text-left text-sm text-text-1 transition hover:border-cyan";

const primaryButtonClass =
  "w-full rounded-xl bg-magenta py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50";

/** Единственный выбор из списка. `null` очищает поле. */
export function UnionChoiceEditor<T extends string>({
  options,
  value,
  onPick,
  clearLabel = "Не указывать",
}: {
  options: Array<[T, string]>;
  value: T | null;
  onPick: (value: T | null) => void;
  clearLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          className={optionClass(value === key)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPick(null)}
        className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-text-2 transition hover:text-text-1"
      >
        {clearLabel}
      </button>
    </div>
  );
}

/** Несколько значений из фиксированного списка. */
export function UnionMultiChoiceEditor<T extends string>({
  options,
  values,
  onApply,
  close,
}: {
  options: Array<[T, string]>;
  values: T[];
  onApply: (values: T[]) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState<T[]>(values);

  function toggle(key: T) {
    setDraft((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <div className="space-y-2">
      {options.map(([key, label]) => (
        <label
          key={key}
          className={`flex cursor-pointer items-center gap-3 ${optionClass(draft.includes(key))}`}
        >
          <input
            type="checkbox"
            checked={draft.includes(key)}
            onChange={() => toggle(key)}
            className="h-4 w-4 accent-magenta"
          />
          {label}
        </label>
      ))}
      <button
        type="button"
        className={primaryButtonClass}
        onClick={() => {
          onApply(draft);
          close();
        }}
      >
        Готово
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/** Целое число в заданных границах; пустое поле очищает значение. */
export function UnionNumberEditor({
  value,
  min,
  max,
  unit,
  onApply,
  close,
}: {
  value: number | null;
  min: number;
  max: number;
  unit?: string;
  onApply: (value: number | null) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const parsed = draft.trim() === "" ? null : Number(draft);
  const invalid =
    parsed !== null &&
    (!Number.isInteger(parsed) || parsed < min || parsed > max);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={draft}
          min={min}
          max={max}
          onChange={(event) => setDraft(event.target.value)}
          className={inputClass}
        />
        {unit && <span className="text-sm text-text-2">{unit}</span>}
      </div>
      {invalid && (
        <p className="text-xs text-magenta">
          Допустимы целые значения от {min} до {max}
        </p>
      )}
      <button
        type="button"
        disabled={invalid}
        className={primaryButtonClass}
        onClick={() => {
          onApply(parsed);
          close();
        }}
      >
        Готово
      </button>
    </div>
  );
}

/** Диапазон возраста партнёра: любая граница может остаться пустой. */
export function UnionRangeEditor({
  min,
  max,
  lowerBound,
  upperBound,
  onApply,
  close,
}: {
  min: number | null;
  max: number | null;
  lowerBound: number;
  upperBound: number;
  onApply: (min: number | null, max: number | null) => void;
  close: () => void;
}) {
  const [from, setFrom] = useState(min == null ? "" : String(min));
  const [to, setTo] = useState(max == null ? "" : String(max));
  const parse = (raw: string) => (raw.trim() === "" ? null : Number(raw));
  const parsedFrom = parse(from);
  const parsedTo = parse(to);
  const outOfBounds = (value: number | null) =>
    value !== null &&
    (!Number.isInteger(value) || value < lowerBound || value > upperBound);
  const inverted =
    parsedFrom !== null && parsedTo !== null && parsedFrom > parsedTo;
  const invalid = outOfBounds(parsedFrom) || outOfBounds(parsedTo) || inverted;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">от</span>
          <input
            type="number"
            inputMode="numeric"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">до</span>
          <input
            type="number"
            inputMode="numeric"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {invalid && (
        <p className="text-xs text-magenta">
          {inverted
            ? "Нижняя граница больше верхней"
            : `Возраст указывается от ${lowerBound} до ${upperBound} лет`}
        </p>
      )}
      <button
        type="button"
        disabled={invalid}
        className={primaryButtonClass}
        onClick={() => {
          onApply(parsedFrom, parsedTo);
          close();
        }}
      >
        Готово
      </button>
    </div>
  );
}

/** Однострочный или многострочный текст. */
export function UnionTextEditor({
  value,
  maxLength,
  rows = 1,
  placeholder,
  onApply,
  close,
}: {
  value: string;
  maxLength: number;
  rows?: number;
  placeholder?: string;
  onApply: (value: string) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="space-y-3">
      {rows > 1 ? (
        <textarea
          value={draft}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          className={inputClass}
        />
      )}
      <p className="text-right text-xs text-text-2">
        {draft.length} / {maxLength}
      </p>
      <button
        type="button"
        className={primaryButtonClass}
        onClick={() => {
          onApply(draft);
          close();
        }}
      >
        Готово
      </button>
    </div>
  );
}
