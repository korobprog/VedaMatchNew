import { describe, expect, it } from "vitest";
import type { MusicRadioItemDto } from "@vedamatch/shared";
import {
  radioItemAt,
  radioItemTitle,
  radioListenersLabel,
  radioMsLeft,
  radioOffsetSeconds,
  radioServerNow,
} from "./radio-sync";

const item = (
  slotId: string,
  startsAt: string,
  durationMs: number,
  over: Partial<MusicRadioItemDto> = {},
): MusicRadioItemDto => ({
  slotId,
  kind: "track",
  startsAt,
  durationMs,
  track: null,
  insertTitle: null,
  streamUrl: null,
  ...over,
});

describe("radio-sync", () => {
  it("серверное время идёт вперёд по часам устройства", () => {
    const now = radioServerNow(
      { serverTime: "2030-01-01T10:00:00.000Z" },
      5_000,
      7_500,
    );
    expect(now).toBe(Date.parse("2030-01-01T10:00:02.500Z"));
  });

  it("часы устройства назад не отматывают", () => {
    const now = radioServerNow(
      { serverTime: "2030-01-01T10:00:00.000Z" },
      5_000,
      1_000,
    );
    expect(now).toBe(Date.parse("2030-01-01T10:00:00.000Z"));
  });

  it("позиция внутри записи, в пределах её длительности", () => {
    const a = item("a", "2030-01-01T10:00:00Z", 60_000);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T10:00:12Z"))).toBe(12);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T09:59:00Z"))).toBe(0);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T10:05:00Z"))).toBe(60);
    expect(radioMsLeft(a, Date.parse("2030-01-01T10:00:50Z"))).toBe(10_000);
  });

  it("устаревший ответ: текущее отзвучало — берём следующее", () => {
    const state = {
      current: item("a", "2030-01-01T10:00:00Z", 60_000),
      next: item("b", "2030-01-01T10:01:00Z", 60_000),
    };
    expect(radioItemAt(state, Date.parse("2030-01-01T10:00:30Z"))?.slotId).toBe(
      "a",
    );
    expect(radioItemAt(state, Date.parse("2030-01-01T10:01:00Z"))?.slotId).toBe(
      "b",
    );
    expect(radioItemAt(state, Date.parse("2030-01-01T10:03:00Z"))).toBeNull();
  });

  it("подписи", () => {
    expect(radioListenersLabel(1)).toBe("1 слушает");
    expect(radioListenersLabel(5)).toBe("5 слушают");
    expect(radioListenersLabel(22)).toBe("22 слушают");
    expect(
      radioItemTitle(
        item("i", "2030-01-01T10:00:00Z", 1, {
          kind: "insert",
          insertTitle: "Объявление",
        }),
      ),
    ).toBe("Объявление");
  });
});
