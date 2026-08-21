import { describe, expect, it } from "vitest";
import { quotaExhausted, quotaLine, shouldPoll, stageItems, STYLE_OPTIONS } from "./reel-wizard-copy";

describe("stageItems", () => {
  it("marks the review stage as failed when rejected", () => {
    expect(stageItems("rejected").map((item) => item.state)).toEqual(["done", "failed", "pending", "pending"]);
  });

  it("marks everything done when published", () => {
    expect(stageItems("published").every((item) => item.state === "done")).toBe(true);
  });

  it("keeps four stages with titles in order", () => {
    expect(stageItems("generating").map((item) => item.title)).toEqual(["Цитата", "Проверка", "Картинка", "Готово"]);
  });
});

describe("shouldPoll", () => {
  it("polls only while the pipeline is working", () => {
    expect(shouldPoll("ai_review")).toBe(true);
    expect(shouldPoll("generating")).toBe(true);
    expect(shouldPoll("admin_review")).toBe(false);
    expect(shouldPoll("rejected")).toBe(false);
    expect(shouldPoll("published")).toBe(false);
  });
});

describe("quota", () => {
  it("describes and detects exhaustion", () => {
    const base = { enabled: true, unlimited: false, limit: 1, used: 1, remaining: 0 };
    expect(quotaLine(base)).toBe("Сегодня: 1 из 1");
    expect(quotaExhausted(base)).toBe(true);
    expect(quotaLine({ ...base, unlimited: true })).toBe("Без лимита · администратор");
    expect(quotaExhausted({ ...base, unlimited: true })).toBe(false);
    expect(quotaLine({ ...base, enabled: false })).toBe("Создание своих рилсов сейчас выключено");
    expect(quotaExhausted(null)).toBe(false);
  });
});

describe("STYLE_OPTIONS", () => {
  it("covers all twelve styles", () => {
    expect(STYLE_OPTIONS).toHaveLength(12);
  });
});
