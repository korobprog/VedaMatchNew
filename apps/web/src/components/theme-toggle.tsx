"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "@/components/theme-provider";

const options: Array<{
  value: ThemePreference;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}> = [
  { value: "light", label: "Светлая", shortLabel: "Светлая", icon: <Sun size={16} /> },
  { value: "system", label: "Как в системе", shortLabel: "Система", icon: <Monitor size={16} /> },
  { value: "dark", label: "Тёмная", shortLabel: "Тёмная", icon: <Moon size={16} /> },
];

/**
 * `compact` fits the desktop header (icons only), `full` fills the width of the
 * mobile drawer with labels.
 */
export function ThemeToggle({
  variant = "compact",
  className,
}: {
  variant?: "compact" | "full";
  className?: string;
}) {
  const { preference, resolved, setPreference } = useTheme();
  const indicatorId = useId();

  return (
    <div
      role="radiogroup"
      aria-label="Тема интерфейса"
      className={cn(
        "flex items-center gap-1 rounded-full border border-glass-brd bg-glass p-1 backdrop-blur-xl",
        variant === "full" && "w-full rounded-2xl",
        className,
      )}
    >
      {options.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={
              option.value === "system"
                ? `Как в системе (${resolved === "dark" ? "тёмная" : "светлая"})`
                : option.label
            }
            onClick={() => setPreference(option.value)}
            className={cn(
              "relative flex items-center justify-center rounded-full transition-colors",
              variant === "compact" ? "h-8 w-8" : "h-14 flex-1 rounded-xl px-2",
              active ? "text-text-0" : "text-text-2 hover:text-text-1",
            )}
          >
            {active && (
              <motion.span
                layoutId={`theme-toggle-${indicatorId}`}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className={cn(
                  "absolute inset-0 bg-gradient-to-r from-magenta/20 to-cyan/20 ring-1 ring-glass-brd",
                  variant === "compact" ? "rounded-full" : "rounded-xl",
                )}
              />
            )}
            <span className="relative z-10 flex flex-col items-center gap-1">
              {option.icon}
              {variant === "full" && (
                <span className="text-[10px] font-medium">{option.shortLabel}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
