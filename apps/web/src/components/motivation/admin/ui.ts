/**
 * Общие классы админки Motivation.
 *
 * `text-base` у полей ввода — не косметика: при кегле меньше 16px iOS Safari
 * зумит страницу на фокусе, и с телефона форма становится непригодной.
 */
export const fieldClass =
  "w-full rounded-xl border border-glass-brd bg-glass px-3 py-2.5 text-base text-text-0 placeholder:text-text-2 disabled:opacity-50";

export const labelClass = "block text-sm font-medium text-text-1";

export const cardClass = "glass rounded-2xl border border-glass-brd p-4 sm:p-5";

/** Тап-цель ≥ 44px и полная ширина на телефоне — иначе кнопки не нажать. */
export const buttonBase =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 sm:w-auto";

export const primaryButton = `${buttonBase} bg-gold text-bg-0 hover:brightness-110`;
export const secondaryButton = `${buttonBase} border border-glass-brd text-text-1 hover:border-cyan/40 hover:text-text-0`;
export const dangerButton = `${buttonBase} border border-red-400/40 text-red-500 hover:bg-red-500/10`;

export const badgeClass =
  "inline-flex items-center rounded-full border border-glass-brd px-2.5 py-1 text-xs font-medium text-text-1";
