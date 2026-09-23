import { describe, expect, it } from "vitest";
import {
  EDGE_SWIPE_ZONE,
  SWIPE_DISTANCE,
  edgeSwipeDirection,
  scrollAllowsEdgeSwipe,
  swipeVerdict,
  touchActionAllowsEdgeSwipe,
} from "./edge-swipe";

describe("edgeSwipeDirection", () => {
  it("у правого края — жест влево, у левого — вправо", () => {
    expect(edgeSwipeDirection(410, 412)).toBe("leftward");
    expect(edgeSwipeDirection(412 - EDGE_SWIPE_ZONE, 412)).toBe("leftward");
    expect(edgeSwipeDirection(2, 412)).toBe("rightward");
    expect(edgeSwipeDirection(EDGE_SWIPE_ZONE, 412)).toBe("rightward");
  });

  it("середина экрана жеста не начинает: там карусели и таблицы", () => {
    expect(edgeSwipeDirection(EDGE_SWIPE_ZONE + 1, 412)).toBeNull();
    expect(edgeSwipeDirection(206, 412)).toBeNull();
    expect(edgeSwipeDirection(412 - EDGE_SWIPE_ZONE - 1, 412)).toBeNull();
  });

  it("на узкой полосе, где зоны сходятся, жеста нет", () => {
    expect(edgeSwipeDirection(10, 60)).toBeNull();
  });
});

describe("swipeVerdict", () => {
  const start = { x: 405, y: 300 };

  it("явно горизонтальный жест внутрь засчитывается", () => {
    expect(
      swipeVerdict(start, { x: 405 - SWIPE_DISTANCE, y: 305 }, "leftward"),
    ).toBe("go");
    expect(
      swipeVerdict({ x: 5, y: 300 }, { x: 5 + 60, y: 290 }, "rightward"),
    ).toBe("go");
  });

  it("короткий жест ещё ждёт", () => {
    expect(swipeVerdict(start, { x: 390, y: 300 }, "leftward")).toBe("wait");
    expect(swipeVerdict(start, start, "leftward")).toBe("wait");
  });

  it("вертикальная прокрутка у края отменяет жест насовсем", () => {
    expect(swipeVerdict(start, { x: 400, y: 340 }, "leftward")).toBe("cancel");
  });

  it("косой мазок — не жест, даже если по горизонтали прошли далеко", () => {
    // 60 вбок и 40 вниз: вертикаль меньше горизонтали, но больше половины.
    expect(swipeVerdict(start, { x: 345, y: 340 }, "leftward")).toBe("wait");
  });

  it("движение наружу, к краю, — не тот жест", () => {
    expect(swipeVerdict({ x: 20, y: 300 }, { x: 5, y: 300 }, "rightward")).toBe(
      "cancel",
    );
    expect(swipeVerdict(start, { x: 420, y: 300 }, "leftward")).toBe("cancel");
  });

  it("дрожание пальца не отменяет", () => {
    expect(swipeVerdict(start, { x: 408, y: 306 }, "leftward")).toBe("wait");
  });
});

describe("scrollAllowsEdgeSwipe", () => {
  const carousel = { scrollWidth: 1200, clientWidth: 400 };

  it("элемент без горизонтальной прокрутки жесту не мешает", () => {
    expect(
      scrollAllowsEdgeSwipe(
        { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 },
        "leftward",
      ),
    ).toBe(true);
  });

  it("карусели, которой есть куда листаться, жест уступает", () => {
    expect(scrollAllowsEdgeSwipe({ ...carousel, scrollLeft: 0 }, "leftward")).toBe(
      false,
    );
    expect(
      scrollAllowsEdgeSwipe({ ...carousel, scrollLeft: 300 }, "rightward"),
    ).toBe(false);
  });

  it("докрученная до упора карусель жест пропускает", () => {
    expect(
      scrollAllowsEdgeSwipe({ ...carousel, scrollLeft: 800 }, "leftward"),
    ).toBe(true);
    expect(scrollAllowsEdgeSwipe({ ...carousel, scrollLeft: 0 }, "rightward")).toBe(
      true,
    );
  });
});

describe("touchActionAllowsEdgeSwipe", () => {
  it("обычные элементы жест пропускают", () => {
    expect(touchActionAllowsEdgeSwipe("auto")).toBe(true);
    expect(touchActionAllowsEdgeSwipe("manipulation")).toBe(true);
    expect(touchActionAllowsEdgeSwipe("pan-x pan-y")).toBe(true);
    expect(touchActionAllowsEdgeSwipe("")).toBe(true);
  });

  it("элемент, который сам разбирает горизонталь, жест забирает себе", () => {
    // Карточка колоды анкет: `touch-pan-y`.
    expect(touchActionAllowsEdgeSwipe("pan-y")).toBe(false);
    expect(touchActionAllowsEdgeSwipe("none")).toBe(false);
    expect(touchActionAllowsEdgeSwipe("pinch-zoom")).toBe(false);
  });
});
