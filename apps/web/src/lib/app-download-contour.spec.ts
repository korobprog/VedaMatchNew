import { describe, expect, it } from "vitest";
import { isComContourHost } from "./app-download-contour";

describe("isComContourHost", () => {
  it("recognises the main .com host", () => {
    expect(isComContourHost("vedamatch.com")).toBe(true);
  });

  it("recognises subdomains of the .com contour", () => {
    expect(isComContourHost("ios.vedamatch.com")).toBe(true);
    expect(isComContourHost("api.vedamatch.com")).toBe(true);
    expect(isComContourHost("www.vedamatch.com")).toBe(true);
  });

  it("keeps a port suffix from breaking the check", () => {
    expect(isComContourHost("vedamatch.com:443")).toBe(true);
  });

  it("rejects the .ru contour", () => {
    expect(isComContourHost("vedamatch.ru")).toBe(false);
    expect(isComContourHost("ios.vedamatch.ru")).toBe(false);
  });

  it("rejects unrelated and malformed hosts", () => {
    expect(isComContourHost("localhost")).toBe(false);
    expect(isComContourHost("example.com")).toBe(false);
    expect(isComContourHost("")).toBe(false);
    expect(isComContourHost(null)).toBe(false);
    expect(isComContourHost(undefined)).toBe(false);
  });
});
