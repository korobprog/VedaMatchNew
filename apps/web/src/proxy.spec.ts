import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("allows guests to open the landing page", () => {
    const response = proxy(new NextRequest("https://vedamatch.ru/"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects guests from protected pages and preserves the destination", () => {
    const response = proxy(
      new NextRequest("https://vedamatch.ru/union?tab=matches"),
    );

    expect(response.headers.get("location")).toBe(
      "https://vedamatch.ru/?returnTo=%2Funion%3Ftab%3Dmatches",
    );
  });

  it("keeps authenticated users away from the login page", () => {
    const response = proxy(
      new NextRequest("https://vedamatch.ru/login", {
        headers: { cookie: "access_token=valid" },
      }),
    );

    expect(response.headers.get("location")).toBe("https://vedamatch.ru/");
  });
});
