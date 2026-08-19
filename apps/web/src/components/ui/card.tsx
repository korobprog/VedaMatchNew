import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Стеклянная карточка на токенах: `.glass` + рамка + скругление. */
export function Card({
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl border border-glass-brd",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-display text-base font-semibold text-text-0",
        className,
      )}
      {...rest}
    />
  );
}
