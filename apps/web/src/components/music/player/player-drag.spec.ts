import { describe, expect, it } from "vitest";
import {
  DOCK_SNAP_PX,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  NO_POSITIONS,
  NUDGE_STEP_PX,
  clampOffset,
  dragAxes,
  isDoubleTap,
  longPressPhase,
  nudgeOffset,
  parsePlayerPositions,
  popoverSide,
  serializePlayerPositions,
  settleOffset,
  viewportBounds,
  type Box,
} from "./player-drag";

/** Телефон 390×844: шапка 56, вырез снизу 34. */
const phone: Box = viewportBounds({
  width: 390,
  height: 844,
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
  headerBottom: 103,
});

/** Развёрнутая полоса во всю ширину у нижнего края. */
const bar: Box = { left: 0, top: 684, right: 390, bottom: 844 };

describe("longPressPhase", () => {
  it("ждёт, пока держат на месте", () => {
    expect(longPressPhase({ elapsedMs: 100, dx: 0, dy: 0 })).toBe("wait");
  });

  it("срабатывает через ~400 мс без сдвига", () => {
    expect(longPressPhase({ elapsedMs: LONG_PRESS_MS, dx: 3, dy: 4 })).toBe(
      "fire",
    );
  });

  it("палец уехал дальше порога — это прокрутка, даже если время вышло", () => {
    expect(
      longPressPhase({
        elapsedMs: LONG_PRESS_MS + 50,
        dx: 0,
        dy: LONG_PRESS_SLOP_PX + 1,
      }),
    ).toBe("cancel");
    expect(longPressPhase({ elapsedMs: 50, dx: 7, dy: 7 })).toBe("cancel");
  });
});

describe("isDoubleTap", () => {
  it("второе нажатие рядом и вскоре", () => {
    expect(
      isDoubleTap({ at: 0, x: 10, y: 10 }, { at: 250, x: 20, y: 14 }),
    ).toBe(true);
  });

  it("первое, медленное или далёкое — не двойное", () => {
    expect(isDoubleTap(null, { at: 0, x: 0, y: 0 })).toBe(false);
    expect(isDoubleTap({ at: 0, x: 0, y: 0 }, { at: 600, x: 0, y: 0 })).toBe(
      false,
    );
    expect(isDoubleTap({ at: 0, x: 0, y: 0 }, { at: 100, x: 80, y: 0 })).toBe(
      false,
    );
  });
});

describe("viewportBounds", () => {
  it("сверху — шапка или вырез, что ниже; снизу и по бокам — вырезы", () => {
    expect(phone).toEqual({ left: 0, top: 103, right: 390, bottom: 810 });
  });

  it("шапки нет или она уехала — только вырез", () => {
    expect(
      viewportBounds({
        width: 800,
        height: 600,
        insets: { top: 0, right: 10, bottom: 0, left: 10 },
        headerBottom: -40,
      }),
    ).toEqual({ left: 10, top: 0, right: 790, bottom: 600 });
  });
});

describe("dragAxes", () => {
  it("полоса во всю ширину — только по вертикали", () => {
    expect(dragAxes(bar, phone)).toBe("y");
  });

  it("узкая полоса на широком экране и пузырь — по обеим осям", () => {
    const wide = { left: 0, top: 0, right: 1920, bottom: 1080 };
    expect(
      dragAxes({ left: 448, top: 1004, right: 1472, bottom: 1068 }, wide),
    ).toBe("both");
    expect(
      dragAxes({ left: 12, top: 700, right: 68, bottom: 756 }, phone),
    ).toBe("both");
  });
});

describe("clampOffset", () => {
  it("не пускает выше шапки и ниже выреза", () => {
    expect(clampOffset({ x: 0, y: -2000 }, bar, phone, "y")).toEqual({
      x: 0,
      y: -581,
    });
    expect(clampOffset({ x: 0, y: 500 }, bar, phone, "y")).toEqual({
      x: 0,
      y: -34,
    });
  });

  it("по одной оси сдвиг вбок обнуляется", () => {
    expect(clampOffset({ x: 120, y: -300 }, bar, phone, "y")).toEqual({
      x: 0,
      y: -300,
    });
  });

  it("по двум осям держит в окне и по горизонтали", () => {
    const bubble = { left: 12, top: 700, right: 68, bottom: 756 };
    expect(clampOffset({ x: 9999, y: -9999 }, bubble, phone, "both")).toEqual({
      x: 322,
      y: -597,
    });
    expect(clampOffset({ x: -100, y: 0 }, bubble, phone, "both")).toEqual({
      x: -12,
      y: 0,
    });
  });

  it("плеер выше окна — держим верх, там название", () => {
    const tall = { left: 0, top: 100, right: 390, bottom: 900 };
    const short = { left: 0, top: 50, right: 390, bottom: 450 };
    expect(clampOffset({ x: 0, y: 0 }, tall, short, "y")).toEqual({
      x: 0,
      y: -50,
    });
  });
});

describe("settleOffset", () => {
  it("отпустили у самого низа — прилипает обратно", () => {
    expect(settleOffset({ x: 0, y: -(DOCK_SNAP_PX - 1) })).toBeNull();
    expect(settleOffset({ x: 0, y: -34 })).toBeNull();
  });

  it("выше порога или в стороне — остаётся откреплённой", () => {
    expect(settleOffset({ x: 0, y: -DOCK_SNAP_PX })).toEqual({
      x: 0,
      y: -DOCK_SNAP_PX,
    });
    expect(settleOffset({ x: 200, y: -10 })).toEqual({ x: 200, y: -10 });
  });
});

describe("nudgeOffset", () => {
  it("с места — на шаг вверх, дальше от текущего", () => {
    expect(nudgeOffset(null, "up")).toEqual({ x: 0, y: -NUDGE_STEP_PX });
    expect(nudgeOffset({ x: 30, y: -100 }, "down")).toEqual({
      x: 30,
      y: -100 + NUDGE_STEP_PX,
    });
  });
});

describe("popoverSide", () => {
  it("у низа — вверх, у шапки — вниз, с местом до края", () => {
    expect(popoverSide(bar, phone)).toEqual({ side: "above", room: 569 });
    expect(
      popoverSide({ left: 0, top: 110, right: 390, bottom: 270 }, phone),
    ).toEqual({
      side: "below",
      room: 528,
    });
  });
});

describe("хранение", () => {
  it("туда и обратно", () => {
    const positions = {
      bar: { x: 0, y: -300 },
      bubble: { x: 120.4, y: -80.6 },
    };
    expect(parsePlayerPositions(serializePlayerPositions(positions))).toEqual({
      bar: { x: 0, y: -300 },
      bubble: { x: 120, y: -81 },
    });
  });

  it("битое, чужое и пустое — плеер на месте", () => {
    expect(parsePlayerPositions(null)).toEqual(NO_POSITIONS);
    expect(parsePlayerPositions("{")).toEqual(NO_POSITIONS);
    expect(parsePlayerPositions("42")).toEqual(NO_POSITIONS);
    expect(
      parsePlayerPositions('{"bar":{"x":"1","y":2},"bubble":{"x":1,"y":null}}'),
    ).toEqual(NO_POSITIONS);
  });
});
