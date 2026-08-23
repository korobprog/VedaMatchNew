/**
 * Автоконтраст текста внутри цветного пузыря. Свободный hex в конструкторе
 * может дать тёмный текст на тёмном фоне — здесь яркость фона считается и
 * текст переключается сам, без участия пользователя. Ink-цвета те же, что
 * использует подложка аватара в chat-author-color.ts — единый стиль.
 */
const DARK_INK = "#0A0614";
const LIGHT_INK = "#F6F1FF";
/** Ниже — фон считается тёмным, текст берётся светлый. */
const LUMINANCE_THRESHOLD = 0.4;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Относительная яркость по WCAG. Некорректный hex — считается светлым фоном. */
function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return 1;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

export function pickBubbleInk(hex: string): string {
  return relativeLuminance(hex) > LUMINANCE_THRESHOLD ? DARK_INK : LIGHT_INK;
}
