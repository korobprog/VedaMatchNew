import { describe, expect, it } from "vitest";
import {
  formatApkSizeMb,
  formatBuildDate,
  parseAppManifest,
  shortSha256,
} from "./app-download";

const VALID_RAW = {
  versionName: "0.1.0+abc1234",
  versionCode: 21042,
  sizeBytes: 44 * 1024 * 1024,
  sha256: "a".repeat(64),
  url: "https://cdn.example.com/mobile/android/ru-site/vedamatch-0.1.0-21042.apk",
  commit: "abc1234",
  builtAt: "2026-09-17T12:00:00.000Z",
  minAndroid: "7.0",
};

describe("parseAppManifest", () => {
  it("парсит валидный манифест целиком", () => {
    expect(parseAppManifest(VALID_RAW)).toEqual({
      ...VALID_RAW,
      sha256: VALID_RAW.sha256.toLowerCase(),
    });
  });

  it("null на пустом ответе, а не исключение", () => {
    expect(parseAppManifest(null)).toBeNull();
    expect(parseAppManifest(undefined)).toBeNull();
    expect(parseAppManifest("не JSON")).toBeNull();
    expect(parseAppManifest({})).toBeNull();
  });

  it("null, когда versionCode или sizeBytes не положительное целое", () => {
    expect(parseAppManifest({ ...VALID_RAW, versionCode: 1.5 })).toBeNull();
    expect(parseAppManifest({ ...VALID_RAW, versionCode: 0 })).toBeNull();
    expect(parseAppManifest({ ...VALID_RAW, sizeBytes: -1 })).toBeNull();
  });

  it("null на невалидном sha256", () => {
    expect(parseAppManifest({ ...VALID_RAW, sha256: "not-a-hash" })).toBeNull();
  });

  it("приводит sha256 к нижнему регистру", () => {
    const manifest = parseAppManifest({ ...VALID_RAW, sha256: "A".repeat(64) });
    expect(manifest?.sha256).toBe("a".repeat(64));
  });

  it("null, когда url не http(s)", () => {
    expect(parseAppManifest({ ...VALID_RAW, url: "ftp://example.com/a.apk" })).toBeNull();
  });

  it("null на нечитаемой дате сборки", () => {
    expect(parseAppManifest({ ...VALID_RAW, builtAt: "вчера" })).toBeNull();
  });

  it("null, когда обязательное поле отсутствует", () => {
    const { minAndroid: _minAndroid, ...withoutMinAndroid } = VALID_RAW;
    void _minAndroid;
    expect(parseAppManifest(withoutMinAndroid)).toBeNull();
  });
});

describe("formatApkSizeMb", () => {
  it("МБ с одним знаком после запятой и русским разделителем", () => {
    expect(formatApkSizeMb(44 * 1024 * 1024)).toBe("44,0 МБ");
    expect(formatApkSizeMb(Math.round(42.7 * 1024 * 1024))).toBe("42,7 МБ");
  });
});

describe("formatBuildDate", () => {
  it("день, полное название месяца и год по-русски", () => {
    expect(formatBuildDate("2026-09-17T12:00:00.000Z")).toContain("2026");
    expect(formatBuildDate("2026-09-17T12:00:00.000Z")).toMatch(/сентября/);
  });
});

describe("shortSha256", () => {
  it("первые восемь знаков", () => {
    expect(shortSha256("abcdef0123456789".padEnd(64, "0"))).toBe("abcdef01");
  });
});
