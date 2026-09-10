import { describe, expect, it } from "vitest";
import { isAbort } from "./is-abort";

describe("isAbort", () => {
  it("узнаёт отмену запроса", () => {
    expect(isAbort(new DOMException("aborted", "AbortError"))).toBe(true);
  });

  it("узнаёт отмену и без DOMException — в jsdom и node формы разные", () => {
    expect(isAbort({ name: "AbortError" })).toBe(true);
  });

  it("настоящий сбой отменой не считает", () => {
    expect(isAbort(new Error("network down"))).toBe(false);
    expect(isAbort(null)).toBe(false);
    expect(isAbort("AbortError")).toBe(false);
  });
});
