/**
 * Контраст по WCAG 2.x для пар «текст на подложке» из токенов темы.
 *
 * Стекло (`rgba`) полупрозрачно, и считать его как записано нельзя: под ним
 * фон экрана, поэтому полупрозрачный цвет сначала накладывается на
 * непрозрачную основу. Тест `contrast.spec.ts` держит все реальные пары
 * интерфейса не ниже 4.5:1.
 */

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = parseInt(hex[1], 16);
    return { rgb: [(value >> 16) & 255, (value >> 8) & 255, value & 255], alpha: 1 };
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim());
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Неизвестный формат цвета: ${color}`);
}

/** Непрозрачный цвет: полупрозрачный слой поверх непрозрачной основы. */
export function composite(color: string, base: string): Rgb {
  const top = parse(color);
  const bottom = parse(base);
  if (bottom.alpha !== 1) throw new Error('Основа должна быть непрозрачной');
  return top.rgb.map((channel, index) =>
    Math.round(channel * top.alpha + bottom.rgb[index] * (1 - top.alpha)),
  ) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Контраст текста на подложке. Полупрозрачная подложка накладывается на
 * `base` — непрозрачный фон экрана под ней.
 */
export function contrastRatio(text: string, surface: string, base = '#000000'): number {
  const background = parse(surface).alpha === 1 ? parse(surface).rgb : composite(surface, base);
  const foreground = parse(text).rgb;
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
