import { describe, expect, it } from "vitest";
import { isBackendUnreachable } from "./error";

describe("isBackendUnreachable", () => {
  it("узнаёт отказ соединения с API во всех виденных формах", () => {
    // Ровно эти строки прилетали из Next.js, когда API перезапускался:
    // сначала обрыв уже установленного соединения, потом отказ в новом.
    for (const message of [
      "fetch failed",
      "read ECONNRESET",
      "write ECONNRESET",
      "connect ECONNREFUSED 127.0.0.1:4000",
    ]) {
      expect(isBackendUnreachable(new Error(message)), message).toBe(true);
    }
  });

  it("не принимает за недоступность обычную ошибку кода", () => {
    // Иначе настоящая поломка пряталась бы за «попробуйте позже», и её никто
    // не стал бы чинить.
    for (const message of [
      "Cannot read properties of undefined",
      "API /motivation/feed failed: 500",
      "Hydration failed",
    ]) {
      expect(isBackendUnreachable(new Error(message)), message).toBe(false);
    }
  });

  it("смотрит и на имя ошибки, а не только на текст", () => {
    const error = new Error("");
    error.name = "NetworkError";
    expect(isBackendUnreachable(error)).toBe(true);
  });
});
