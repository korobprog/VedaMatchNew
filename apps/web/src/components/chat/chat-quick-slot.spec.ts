import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_QUICK_SLOT,
  effectiveQuickSlot,
  parseQuickSlot,
} from "./chat-quick-slot";

describe("parseQuickSlot", () => {
  it("по умолчанию — ассистент", () => {
    expect(DEFAULT_CHAT_QUICK_SLOT).toBe("assistant");
    expect(parseQuickSlot(null)).toBe("assistant");
    expect(parseQuickSlot("")).toBe("assistant");
  });

  it("знакомую плитку возвращает, незнакомую — молча мимо", () => {
    expect(parseQuickSlot("photo")).toBe("photo");
    expect(parseQuickSlot("sticker")).toBe("assistant");
  });
});

describe("effectiveQuickSlot", () => {
  it("выключенный ассистент уступает место фото, остальное не трогает", () => {
    expect(effectiveQuickSlot("assistant", { assistantEnabled: false })).toBe("photo");
    expect(effectiveQuickSlot("assistant", { assistantEnabled: true })).toBe("assistant");
    expect(effectiveQuickSlot("file", { assistantEnabled: false })).toBe("file");
  });
});
