import { describe, expect, it } from "vitest";
import { seekHotkeyDirection } from "./seek-hotkeys";

const key = (over: Partial<Parameters<typeof seekHotkeyDirection>[0]> = {}) => ({
  key: "ArrowLeft",
  shiftKey: true,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  ...over,
});

describe("seekHotkeyDirection", () => {
  it("Shift+← назад, Shift+→ вперёд", () => {
    expect(seekHotkeyDirection(key(), { tagName: "BODY" })).toBe(-1);
    expect(seekHotkeyDirection(key({ key: "ArrowRight" }), { tagName: "BUTTON" })).toBe(1);
  });

  it("без Shift и с другими модификаторами — не наше", () => {
    expect(seekHotkeyDirection(key({ shiftKey: false }), null)).toBeNull();
    expect(seekHotkeyDirection(key({ altKey: true }), null)).toBeNull();
    expect(seekHotkeyDirection(key({ ctrlKey: true }), null)).toBeNull();
    expect(seekHotkeyDirection(key({ metaKey: true }), null)).toBeNull();
    expect(seekHotkeyDirection(key({ key: "ArrowUp" }), null)).toBeNull();
  });

  it("в поле ввода и ползунке стрелки не перехватывает", () => {
    expect(seekHotkeyDirection(key(), { tagName: "INPUT", type: "text" })).toBeNull();
    expect(seekHotkeyDirection(key(), { tagName: "input", type: "range" })).toBeNull();
    expect(seekHotkeyDirection(key(), { tagName: "TEXTAREA" })).toBeNull();
    expect(seekHotkeyDirection(key(), { tagName: "DIV", isContentEditable: true })).toBeNull();
    expect(seekHotkeyDirection(key(), { tagName: "BUTTON", role: "tab" })).toBeNull();
  });

  it("уже обработанное кем-то — не наше", () => {
    expect(seekHotkeyDirection(key({ defaultPrevented: true }), null)).toBeNull();
  });
});
