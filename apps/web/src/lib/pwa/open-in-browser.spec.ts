import { describe, expect, it } from "vitest";
import {
  buildAndroidIntentUrl,
  chromeAndroidPackage,
  samsungAndroidPackage,
} from "./open-in-browser";

describe("buildAndroidIntentUrl", () => {
  it("hands the address to Chrome without its scheme", () => {
    expect(
      buildAndroidIntentUrl("https://vedamatch.ru/union", chromeAndroidPackage),
    ).toBe(
      "intent://vedamatch.ru/union#Intent;scheme=https;package=com.android.chrome;end",
    );
  });

  it("keeps the query string, which carries returnTo", () => {
    expect(
      buildAndroidIntentUrl(
        "https://vedamatch.ru/?returnTo=%2Fprofile",
        chromeAndroidPackage,
      ),
    ).toContain("intent://vedamatch.ru/?returnTo=%2Fprofile#Intent");
  });

  it("drops the fragment, whose place is taken by the intent description", () => {
    expect(
      buildAndroidIntentUrl(
        "https://vedamatch.ru/library#section",
        samsungAndroidPackage,
      ),
    ).toBe(
      "intent://vedamatch.ru/library#Intent;scheme=https;package=com.sec.android.app.sbrowser;end",
    );
  });

  it("carries the port through, so a dev build stays reachable", () => {
    expect(
      buildAndroidIntentUrl("http://192.168.0.2:3000/", chromeAndroidPackage),
    ).toBe(
      "intent://192.168.0.2:3000/#Intent;scheme=http;package=com.android.chrome;end",
    );
  });

  it.each(["not a url", "javascript:alert(1)", "file:///etc/passwd"])(
    "refuses %s instead of building a link that hands over control",
    (href) => {
      expect(buildAndroidIntentUrl(href, chromeAndroidPackage)).toBeNull();
    },
  );
});
