import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Классы для обёртки (label + поле + подсказка). */
  wrapperClassName?: string;
}

export const fieldClassName =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2 " +
  "outline-none transition focus-visible:border-magenta/50 focus-visible:ring-2 focus-visible:ring-magenta/30 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500/60";

export function FieldMessages({
  hintId,
  hint,
  errorId,
  error,
}: {
  hintId?: string;
  hint?: string;
  errorId?: string;
  error?: string | null;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-text-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}
    </>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, wrapperClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("block", wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-xs text-text-2">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldClassName, className)}
        {...rest}
      />
      <FieldMessages hintId={hintId} hint={hint} errorId={errorId} error={error} />
    </div>
  );
});
