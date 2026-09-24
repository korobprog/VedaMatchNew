import { describe, expect, it } from "vitest";
import { AUDIOBOOK_KIND_COPY, audiobookHref } from "./audiobook-kind";

describe("audiobook-kind", () => {
  it("цикл ведёт в свой раздел", () => {
    expect(audiobookHref("audiobook", "gita")).toBe("/music/audiobooks/gita");
    expect(audiobookHref("lecture", "gita")).toBe("/music/lectures/gita");
  });

  it("у разделов разные адреса и названия", () => {
    const { audiobook, lecture } = AUDIOBOOK_KIND_COPY;
    expect(lecture.path).not.toBe(audiobook.path);
    expect(lecture.adminPath).not.toBe(audiobook.adminPath);
    expect(lecture.section).toBe("Лекции");
  });
});
