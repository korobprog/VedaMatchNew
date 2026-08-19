import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FieldMessages, fieldClassName } from "./input";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, id, className, wrapperClassName, rows = 3, ...rest },
    ref,
  ) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;
    const describedBy =
      [hintId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className={cn("block", wrapperClassName)}>
        {label && (
          <label htmlFor={fieldId} className="mb-1 block text-xs text-text-2">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldClassName, "resize-y", className)}
          {...rest}
        />
        <FieldMessages
          hintId={hintId}
          hint={hint}
          errorId={errorId}
          error={error}
        />
      </div>
    );
  },
);
