import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHART_LABEL_OPACITY,
  CHART_LINE_OPACITY,
} from "./chart-wheel";

/**
 * Карта рождения рисуется одним цветом — `currentColor`, то есть --vm-text-0,
 * — а линии и подписи отличаются только прозрачностью. Значит контраст здесь
 * не свойство цвета, а свойство доли: занизишь её на глаз ради «поаккуратнее»
 * — и карта на светлой теме снова станет нечитаемой, как было с 0.35 и 0.4.
 *
 * Токены тест читает прямо из globals.css, а не держит их копию: тогда он
 * ловит и правку долей, и правку самих цветов темы.
 */

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** Значение переменной внутри блока с нужным селектором. */
function tokenIn(selector: string, name: string): string {
  const block = CSS.split("}").find(
    (chunk) => chunk.includes(selector) && chunk.includes(name),
  );
  if (!block) throw new Error(`Не нашёл блок ${selector} с ${name}`);
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  if (!match) throw new Error(`Не нашёл ${name} в блоке ${selector}`);
  return match[1];
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Контраст цвета, положенного на фон с прозрачностью `alpha`. */
function contrastAt(fg: string, bg: string, alpha: number): number {
  const front = rgb(fg);
  const back = rgb(bg);
  const blended = back.map((c, i) => front[i] * alpha + c * (1 - alpha)) as [
    number,
    number,
    number,
  ];
  const [light, dark] = [luminance(blended), luminance(back)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = [
  { name: "светлой", selector: '[data-theme="light"]' },
  { name: "тёмной", selector: '[data-theme="dark"]' },
];

describe("контраст карты рождения", () => {
  it("читает токены темы из globals.css", () => {
    // Если разметка файла изменится, тест обязан упасть здесь, а не молча
    // проверять пустоту.
    for (const theme of THEMES) {
      expect(tokenIn(theme.selector, "--vm-text-0")).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(tokenIn(theme.selector, "--vm-bg-0")).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  for (const theme of THEMES) {
    it(`линии карты проходят 3:1 на ${theme.name} теме`, () => {
      // 3:1 — порог WCAG 1.4.11 для графики и элементов интерфейса.
      const ratio = contrastAt(
        tokenIn(theme.selector, "--vm-text-0"),
        tokenIn(theme.selector, "--vm-bg-0"),
        CHART_LINE_OPACITY,
      );
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it(`подписи карты проходят 4.5:1 на ${theme.name} теме`, () => {
      // Названия знаков и номера бхав — 9px, то есть мелкий текст: 4.5:1.
      const ratio = contrastAt(
        tokenIn(theme.selector, "--vm-text-0"),
        tokenIn(theme.selector, "--vm-bg-0"),
        CHART_LABEL_OPACITY,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("подписи заметнее линий — иначе сетка спорит с текстом", () => {
    expect(CHART_LABEL_OPACITY).toBeGreaterThan(CHART_LINE_OPACITY);
  });

  it("ловит занижение долей обратно к прежним", () => {
    // Прежние 0.35 и 0.4 давали 2.25:1 и 2.58:1 — тест обязан их отвергнуть.
    const light = {
      fg: tokenIn('[data-theme="light"]', "--vm-text-0"),
      bg: tokenIn('[data-theme="light"]', "--vm-bg-0"),
    };
    expect(contrastAt(light.fg, light.bg, 0.35)).toBeLessThan(3);
    expect(contrastAt(light.fg, light.bg, 0.4)).toBeLessThan(4.5);
  });
});
