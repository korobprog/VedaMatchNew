import { describe, expect, it } from "vitest";
import { resolveDownloadDevice } from "./app-download-device";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

describe("resolveDownloadDevice", () => {
  it("android по User-Agent Android", () => {
    expect(resolveDownloadDevice(ANDROID_UA)).toBe("android");
  });

  it("ios по User-Agent iPhone", () => {
    expect(resolveDownloadDevice(IOS_UA)).toBe("ios");
  });

  it("desktop иначе", () => {
    expect(resolveDownloadDevice(DESKTOP_UA)).toBe("desktop");
  });
});
