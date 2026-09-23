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

/**
 * Квадратная кнопка-значок (VED-199): 44×44 — меньше палец не попадает.
 * Подписи у неё нет, поэтому `aria-label` и `title` обязательны у каждой.
 */
const iconButtonBase =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-50";
export const iconButton = `${iconButtonBase} border-glass-brd text-text-1 hover:border-cyan/40 hover:text-text-0 aria-expanded:border-magenta aria-expanded:text-text-0`;
export const iconDangerButton = `${iconButtonBase} border-red-400/40 text-red-500 hover:bg-red-500/10 aria-expanded:bg-red-500/10`;

/**
 * Кнопка-значок с видимой подписью (VED-251).
 *
 * То же, что `iconButton`, но слово под значком читается сразу, без
 * наведения мышью: `title` на телефоне не показывается никогда, и голый
 * значок там — загадка, а не кнопка. Тап-цель остаётся ≥44px: `min-h-14`
 * берёт значок и строку подписи, ширину задаёт колонка сетки.
 *
 * Сетка — четыре колонки и на телефоне (VED-343), поэтому кегль подписи
 * идёт от ширины экрана, а не один на всех. Замер в Chromium, самая длинная
 * подпись «Поделиться»: клетка 59px на 320, 69px на 360, 79px на 400. При
 * 12px слово занимает 69px и в 360 не входит, поэтому до 400px — 11px (на
 * 320 — 10px) с плотным трекингом и почти без боковых полей; с 400px, где
 * и живёт телефон заказчика (412px), — снова 12px, как было. Клетка во всех
 * случаях не ниже 56px и не уже 59px — цель касания больше 44×44.
 *
 * Цвет подписи — `text-text-1`, а не `text-text-2`: вторичный на стекле не
 * добирает 4.5:1 на мелком кегле (замер записан в `globals.css`).
 */
const iconTileBase =
  "inline-flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-0.5 py-1.5 text-center text-[10px] leading-tight tracking-tight whitespace-nowrap transition-colors disabled:opacity-50 min-[360px]:text-[11px] min-[400px]:px-1 min-[400px]:text-xs min-[400px]:tracking-normal";
export const iconTile = `${iconTileBase} border-glass-brd text-text-1 hover:border-cyan/40 hover:text-text-0 aria-expanded:border-magenta aria-expanded:text-text-0`;
export const iconTileDanger = `${iconTileBase} border-red-400/40 text-red-500 hover:bg-red-500/10 aria-expanded:bg-red-500/10`;

export const badgeClass =
  "inline-flex items-center rounded-full border border-glass-brd px-2.5 py-1 text-xs font-medium text-text-1";
