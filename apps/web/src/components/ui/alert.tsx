import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "error";

const tones: Record<AlertTone, string> = {
  info: "border-cyan/40 bg-cyan/10 text-text-0",
  success: "border-cyan/50 bg-cyan/15 text-text-0",
  error: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
};

/**
 * Сообщение состояния. Ошибка объявляется через `role="alert"` (прерывает
 * читалку), остальное — `role="status"` (вежливо, по очереди).
 */
export function Alert({
  tone = "info",
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-3 py-2 text-sm", tones[tone], className)}
      {...rest}
    >
      {children}
    </div>
  );
}
