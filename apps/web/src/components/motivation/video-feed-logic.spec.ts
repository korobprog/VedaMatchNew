import { describe, expect, it } from "vitest";
import {
  appendVideos,
  shouldAutoplay,
  videoCategoryChips,
  videoTapAction,
  videoTapLabel,
} from "./video-feed-logic";

describe("videoTapAction", () => {
  it("идущий без звука — первое касание включает звук, не паузу", () => {
    expect(videoTapAction({ paused: false, muted: true })).toBe("unmute");
  });

  it("со звуком касание — пауза", () => {
    expect(videoTapAction({ paused: false, muted: false })).toBe("pause");
  });

  it("стоящий ролик касание запускает", () => {
    expect(videoTapAction({ paused: true, muted: true })).toBe("play");
    expect(videoTapAction({ paused: true, muted: false })).toBe("play");
  });

  it("подпись говорит, что сделает нажатие", () => {
    expect(videoTapLabel("play", " Утро ")).toBe("Смотреть «Утро» со звуком");
    expect(videoTapLabel("unmute", "")).toBe("Включить звук: ролик");
    expect(videoTapLabel("pause", "Утро")).toBe("Пауза: «Утро»");
  });
});

describe("shouldAutoplay", () => {
  it("только активный, в открытой вкладке и без reduced motion", () => {
    expect(
      shouldAutoplay({ active: true, visible: true, reducedMotion: false }),
    ).toBe(true);
    expect(
      shouldAutoplay({ active: true, visible: true, reducedMotion: true }),
    ).toBe(false);
    expect(
      shouldAutoplay({ active: false, visible: true, reducedMotion: false }),
    ).toBe(false);
    expect(
      shouldAutoplay({ active: true, visible: false, reducedMotion: false }),
    ).toBe(false);
  });
});

describe("videoCategoryChips", () => {
  const categories = [
    {
      id: "r",
      slug: "obshchaya",
      title: "Общая",
      parentId: null,
      videoCount: 0,
    },
    { id: "a", slug: "vedy", title: "Веды", parentId: "r", videoCount: 3 },
  ];

  it("«Все» первой, дальше папки в порядке дерева, ссылки во вкладку видео", () => {
    expect(videoCategoryChips(categories, undefined)).toEqual([
      {
        slug: null,
        title: "Все",
        href: "/motivation?tab=video",
        current: true,
        nested: false,
      },
      {
        slug: "obshchaya",
        title: "Общая",
        href: "/motivation?tab=video&category=obshchaya",
        current: false,
        nested: false,
      },
      {
        slug: "vedy",
        title: "Веды",
        href: "/motivation?tab=video&category=vedy",
        current: false,
        nested: true,
      },
    ]);
  });

  it("выбранная папка горит, «Все» — нет", () => {
    const chips = videoCategoryChips(categories, "vedy");
    expect(
      chips.filter((chip) => chip.current).map((chip) => chip.slug),
    ).toEqual(["vedy"]);
  });

  it("папка без роликов в адресе — ничего не горит", () => {
    expect(
      videoCategoryChips(categories, "pusto").some((chip) => chip.current),
    ).toBe(false);
  });
});

describe("appendVideos", () => {
  it("ролик на стыке страниц не удваивается", () => {
    expect(
      appendVideos([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
