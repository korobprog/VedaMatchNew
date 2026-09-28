import { describe, expect, it } from "vitest";
import { anchoredPosition, type AnchorRect } from "./anchored-position";

const viewport = { width: 1024, height: 768 };
const panel = { width: 288, height: 300 };

function button(left: number, top: number, size = 44): AnchorRect {
  return { left, top, right: left + size, bottom: top + size };
}

function popover(result: ReturnType<typeof anchoredPosition>) {
  if (result.mode !== "popover") throw new Error("ожидалось меню у кнопки");
  return result;
}

describe("anchoredPosition (VED-604)", () => {
  it("по умолчанию — под кнопкой от её левого края", () => {
    const at = popover(anchoredPosition(button(100, 100), panel, viewport));
    expect(at).toMatchObject({ placement: "bottom", left: 100, top: 152 });
    expect(at.maxHeight).toBe(768 - 8 - 152);
  });

  it("справа нет места — по правому краю кнопки", () => {
    const at = popover(anchoredPosition(button(900, 100), panel, viewport));
    expect(at.left).toBe(944 - 288);
  });

  it("кнопка у левого края и align=end — всё равно не уезжает влево", () => {
    const at = popover(
      anchoredPosition(button(16, 100), panel, viewport, { align: "end" }),
    );
    expect(at.left).toBe(16);
  });

  it("ни так ни так не влезает — прижато к краю экрана с отступом", () => {
    const narrow = { width: 500, height: 768 };
    const at = popover(
      anchoredPosition(button(200, 100), { width: 480, height: 200 }, narrow),
    );
    expect(at.width).toBe(480);
    expect(at.left).toBe(500 - 8 - 480);
  });

  it("меню шире экрана — ширина по экрану минус отступы", () => {
    const at = popover(
      anchoredPosition(
        button(10, 10),
        { width: 900, height: 100 },
        {
          width: 600,
          height: 768,
        },
      ),
    );
    expect(at.width).toBe(584);
    expect(at.left).toBe(8);
  });

  it("снизу нет места — открывается вверх", () => {
    const at = popover(anchoredPosition(button(100, 600), panel, viewport));
    expect(at.placement).toBe("top");
    expect(at.top).toBe(600 - 8 - 300);
    expect(at.maxHeight).toBe(600 - 8 - 8);
  });

  it("не помещается ни снизу ни сверху — где больше места, с прокруткой", () => {
    const tall = { width: 288, height: 1000 };
    const below = popover(anchoredPosition(button(100, 200), tall, viewport));
    expect(below).toMatchObject({ placement: "bottom", top: 252 });
    expect(below.maxHeight).toBe(768 - 8 - 252);

    const above = popover(anchoredPosition(button(100, 500), tall, viewport));
    expect(above.placement).toBe("top");
    expect(above.maxHeight).toBe(500 - 8 - 8);
    expect(above.top).toBe(8);
  });

  it("всегда в пределах экрана, даже если кнопка уехала за край", () => {
    for (const anchor of [
      button(-50, -80),
      button(1100, 900),
      button(500, 740),
      button(980, 0),
    ]) {
      const at = popover(anchoredPosition(anchor, panel, viewport));
      const shown = Math.min(panel.height, at.maxHeight);
      expect(at.left).toBeGreaterThanOrEqual(8);
      expect(at.left + at.width).toBeLessThanOrEqual(1024 - 8);
      expect(at.top).toBeGreaterThanOrEqual(8);
      expect(at.top + shown).toBeLessThanOrEqual(768 - 8);
      expect(at.maxHeight).toBeGreaterThanOrEqual(160);
    }
  });

  it("узкий экран — нижний лист", () => {
    expect(
      anchoredPosition(button(10, 10), panel, { width: 390, height: 844 }),
    ).toEqual({ mode: "sheet" });
    expect(
      anchoredPosition(button(10, 10), panel, { width: 420, height: 844 }),
    ).toEqual({ mode: "sheet" });
    expect(
      anchoredPosition(button(10, 10), panel, { width: 421, height: 844 }).mode,
    ).toBe("popover");
  });

  it("лист можно отключить", () => {
    expect(
      anchoredPosition(
        button(10, 10),
        panel,
        { width: 390, height: 844 },
        {
          sheetMaxWidth: 0,
        },
      ).mode,
    ).toBe("popover");
  });
});
