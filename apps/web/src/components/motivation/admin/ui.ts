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
 * идёт от ширины экрана, а не один на всех. С VED-264 список на телефоне
 * отдаёт 24px справа под кнопки прокрутки (`SCROLL_NAV_GUTTER`), и клетка
 * стала уже. Замер в Chromium, самая длинная подпись «Поделиться»: клетка
 * 57px на 320, 63px на 360, 76px на 412. Слово занимает 55px при 10px,
 * 61px при 11px и 69px при 12px, поэтому до 380px — 10px (на 320 ещё и без
 * боковых полей), до 440px — 11px, включая телефон заказчика (412px: в 12px
 * слово на 3px шире клетки), с 440px — 12px. Клетка во всех случаях не ниже
 * 56px и не уже 57px — цель касания больше 44×44.
 *
 * Цвет подписи — `text-text-1`, а не `text-text-2`: вторичный на стекле не
 * добирает 4.5:1 на мелком кегле (замер записан в `globals.css`).
 */
const iconTileBase =
  "inline-flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-0 py-1.5 text-center text-[10px] leading-tight tracking-tight whitespace-nowrap transition-colors disabled:opacity-50 min-[360px]:px-0.5 min-[380px]:text-[11px] min-[400px]:px-1 min-[440px]:text-xs min-[440px]:tracking-normal";
export const iconTile = `${iconTileBase} border-glass-brd text-text-1 hover:border-cyan/40 hover:text-text-0 aria-expanded:border-magenta aria-expanded:text-text-0`;
/* Красный подписи — по теме (VED-343): `text-red-500` на светлой карточке
   давал 3.75:1 — мало для 11px. `red-700` там ≈ 6:1, на тёмной `red-400`. */
export const iconTileDanger = `${iconTileBase} border-red-400/40 text-red-700 hover:bg-red-500/10 aria-expanded:bg-red-500/10 dark:text-red-400`;

export const badgeClass =
  "inline-flex items-center rounded-full border border-glass-brd px-2.5 py-1 text-xs font-medium text-text-1";
