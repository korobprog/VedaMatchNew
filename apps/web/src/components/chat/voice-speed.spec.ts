import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_SPEED,
  formatVoiceSpeed,
  nextVoiceSpeed,
  parseVoiceSpeed,
  VOICE_SPEEDS,
} from "./voice-speed";

describe("nextVoiceSpeed", () => {
  it("идёт по кругу 1 → 1.5 → 2 → 2.5 → 3 → 1", () => {
    const seen: number[] = [];
    let speed: number = DEFAULT_VOICE_SPEED;
    for (let step = 0; step < VOICE_SPEEDS.length + 1; step += 1) {
      seen.push(speed);
      speed = nextVoiceSpeed(speed);
    }
    expect(seen).toEqual([1, 1.5, 2, 2.5, 3, 1]);
  });

  it("с неизвестной скорости переходит на первую ускоренную", () => {
    expect(nextVoiceSpeed(1.25)).toBe(1.5);
  });
});

describe("parseVoiceSpeed", () => {
  it("читает сохранённые значения из списка", () => {
    expect(parseVoiceSpeed("2.5")).toBe(2.5);
    expect(parseVoiceSpeed("3")).toBe(3);
  });

  it("всё прочее — скорость по умолчанию", () => {
    expect(parseVoiceSpeed(null)).toBe(1);
    expect(parseVoiceSpeed("")).toBe(1);
    expect(parseVoiceSpeed("7")).toBe(1);
    expect(parseVoiceSpeed("abc")).toBe(1);
  });
});

describe("formatVoiceSpeed", () => {
  it("пишет скорость без лишних нулей", () => {
    expect(formatVoiceSpeed(1)).toBe("1×");
    expect(formatVoiceSpeed(1.5)).toBe("1.5×");
    expect(formatVoiceSpeed(3)).toBe("3×");
  });
});
