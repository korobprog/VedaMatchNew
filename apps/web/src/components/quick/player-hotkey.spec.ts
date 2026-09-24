import { describe, expect, it } from "vitest";
import { planPlayerHotkey, restorePlan } from "./player-hotkey";

describe("planPlayerHotkey", () => {
  it("на паузе — снимает с паузы", () => {
    expect(planPlayerHotkey({ hasTrack: true, isPlaying: false })).toBe("resume");
  });

  it("играющую запись ставит на паузу (VED-438)", () => {
    expect(planPlayerHotkey({ hasTrack: true, isPlaying: true })).toBe("pause");
  });

  it("закрытый плеер поднимает сохранённую запись", () => {
    expect(planPlayerHotkey({ hasTrack: false, isPlaying: false })).toBe(
      "restore",
    );
    expect(planPlayerHotkey(null)).toBe("restore");
  });
});

describe("restorePlan", () => {
  it("берёт запись, очередь и секунду", () => {
    expect(
      restorePlan({ trackId: "t2", queue: ["t1", "t2", 5, ""], positionSeconds: 42 }),
    ).toEqual({ trackId: "t2", queue: ["t1", "t2"], positionSeconds: 42 });
  });

  it("без записи играть нечего", () => {
    expect(restorePlan(null)).toBeNull();
    expect(restorePlan({ trackId: null })).toBeNull();
    expect(restorePlan({ trackId: "" })).toBeNull();
  });

  it("странная позиция — с начала", () => {
    expect(restorePlan({ trackId: "t", positionSeconds: -3 })).toEqual({
      trackId: "t",
      queue: [],
      positionSeconds: 0,
    });
  });
});
