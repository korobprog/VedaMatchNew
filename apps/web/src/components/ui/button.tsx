import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Идёт запрос: кнопка недоступна, рядом с подписью крутится спиннер. */
  loading?: boolean;
  leftIcon?: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-magenta text-white hover:shadow-[0_0_20px_var(--vm-glow-magenta)] hover:brightness-110",
  secondary:
    "glass border border-glass-brd text-text-0 hover:border-magenta/40",
  danger:
    "border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
  ghost: "text-text-1 hover:bg-glass hover:text-text-0",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

/** Классы кнопки для случаев, когда нужен Link или a с тем же видом. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(base, buttonVariants[variant], buttonSizes[size], className);
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClassName({ variant, size, className })}
        {...rest}
      >
        {loading ? <Spinner /> : leftIcon}
        {children}
      </button>
    );
  },
);
