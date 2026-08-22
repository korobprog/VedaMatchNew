import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatChatDivider,
  formatChatStamp,
  formatDuration,
} from "./chat-time";

const now = new Date("2026-08-22T15:00:00");

describe("formatChatStamp", () => {
  it("сегодняшнее показывает часами", () => {
    expect(formatChatStamp("2026-08-22T09:05:00", now)).toMatch(/09:05/);
  });

  it("вчерашнее подписывает словом", () => {
    expect(formatChatStamp("2026-08-21T23:00:00", now)).toBe("вчера");
  });

  it("на этой неделе показывает день недели", () => {
    expect(formatChatStamp("2026-08-18T10:00:00", now)).toBe("вт");
  });

  it("старое показывает датой", () => {
    expect(formatChatStamp("2026-07-01T10:00:00", now)).toMatch(/июл/);
  });

  it("пустое и битое не ломают строку", () => {
    expect(formatChatStamp(null, now)).toBe("");
    expect(formatChatStamp("не дата", now)).toBe("");
  });
});

describe("formatChatDivider", () => {
  it("различает сегодня и вчера", () => {
    expect(formatChatDivider("2026-08-22T01:00:00", now)).toBe("Сегодня");
    expect(formatChatDivider("2026-08-21T01:00:00", now)).toBe("Вчера");
  });

  it("прошлый год подписывает годом", () => {
    expect(formatChatDivider("2025-08-21T01:00:00", now)).toMatch(/2025/);
  });
});

describe("formatDuration", () => {
  it("дополняет секунды нулём", () => {
    expect(formatDuration(24)).toBe("0:24");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("отрицательное и пустое считает нулём", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(undefined)).toBe("0:00");
  });
});

describe("formatBytes", () => {
  it("переводит в килобайты и мегабайты", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(2048)).toBe("2 КБ");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 МБ");
  });

  it("пустое не показывает вовсе", () => {
    expect(formatBytes(0)).toBe("");
  });
});
