import { describe, expect, it } from "vitest";
import { getSafeReturnTo, loginHref } from "./return-to";

describe("getSafeReturnTo", () => {
  it("пропускает внутренний путь с query и hash", () => {
    expect(getSafeReturnTo("/union?tab=matches#top")).toBe(
      "/union?tab=matches#top",
    );
  });

  it("всё внешнее и пустое превращает в «/»", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "union",
      "//evil.example/x",
      "https://evil.example",
      "javascript:alert(1)",
    ]) {
      expect(getSafeReturnTo(bad)).toBe("/");
    }
  });
});

describe("loginHref", () => {
  it("кодирует returnTo в query", () => {
    expect(loginHref("/notices/abc?x=1")).toBe(
      "/login?returnTo=%2Fnotices%2Fabc%3Fx%3D1",
    );
  });

  it("без пути возврата даёт чистый /login", () => {
    expect(loginHref(undefined)).toBe("/login");
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("https://evil.example")).toBe("/login");
  });
});
