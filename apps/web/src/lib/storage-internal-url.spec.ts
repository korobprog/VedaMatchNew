import { describe, expect, it } from "vitest";
import { toInternalStorageUrl } from "./storage-internal-url";

const PUBLIC = "https://media.vedamatch.ru/bucket";
const INTERNAL = "https://firsts3.ru";

describe("toInternalStorageUrl", () => {
  it("меняет публичный домен на хранилище, путь и query остаются", () => {
    expect(
      toInternalStorageUrl(
        "https://media.vedamatch.ru/bucket/motivation/a.png?X-Amz-Signature=1",
        PUBLIC,
        INTERNAL,
      ),
    ).toBe("https://firsts3.ru/bucket/motivation/a.png?X-Amz-Signature=1");
  });

  it("чужие адреса не трогает", () => {
    const url = "https://example.com/bucket/a.png";
    expect(toInternalStorageUrl(url, PUBLIC, INTERNAL)).toBe(url);
    const lookalike = "https://media.vedamatch.ru.evil.com/a.png";
    expect(toInternalStorageUrl(lookalike, PUBLIC, INTERNAL)).toBe(lookalike);
  });

  it("без адресов или с одинаковым origin — как есть", () => {
    const url = "https://media.vedamatch.ru/bucket/a.png";
    expect(toInternalStorageUrl(url, undefined, INTERNAL)).toBe(url);
    expect(toInternalStorageUrl(url, PUBLIC, undefined)).toBe(url);
    expect(toInternalStorageUrl(url, PUBLIC, "не адрес")).toBe(url);
    expect(
      toInternalStorageUrl(url, PUBLIC, "https://media.vedamatch.ru"),
    ).toBe(url);
  });
});
