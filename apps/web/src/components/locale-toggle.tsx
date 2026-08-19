"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME, LOCALES, type Locale } from "@/lib/locale";

const labels: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
};

function writeLocaleCookie(next: Locale): void {
  document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * `compact` fits the desktop header, `full` fills the width of the mobile
 * drawer with labels — mirrors ThemeToggle's variants.
 */
export function LocaleToggle({
  variant = "compact",
  className,
}: {
  variant?: "compact" | "full";
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setLocale(next: Locale) {
    if (next === locale) return;
    writeLocaleCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("interfaceLanguage")}
      className={cn(
        "flex items-center gap-1 rounded-full border border-glass-brd bg-glass p-1 backdrop-blur-xl",
        variant === "full" && "w-full rounded-2xl",
        isPending && "opacity-70",
        className,
      )}
    >
      {LOCALES.map((value) => {
        const active = locale === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labels[value]}
            onClick={() => setLocale(value)}
            className={cn(
              "relative flex items-center justify-center rounded-full text-xs font-semibold transition-colors",
              variant === "compact" ? "h-8 w-8" : "h-10 flex-1 rounded-xl",
              active
                ? "bg-gradient-to-r from-magenta/20 to-cyan/20 text-text-0 ring-1 ring-glass-brd"
                : "text-text-2 hover:text-text-1",
            )}
          >
            {labels[value]}
          </button>
        );
      })}
    </div>
  );
}
