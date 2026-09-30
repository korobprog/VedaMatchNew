import { describe, expect, it } from "vitest";
import { BLOG_ALBUM_MAX_PHOTOS, BLOG_IMAGE_MAX_BYTES } from "@vedamatch/shared";
import { albumErrorText, albumPreflight, chunk } from "./blog-album";

function file(name: string, type: string, size = 100): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("chunk", () => {
  it("режет на куски и оставляет хвост", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("пустой список — пустой результат", () => {
    expect(chunk([], 3)).toEqual([]);
  });
  it("нелепый размер не зацикливает", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe("albumPreflight", () => {
  it("принимает картинки, отбраковывает чужие типы и тяжёлые", () => {
    const ok = file("a.jpg", "image/jpeg");
    const pdf = file("b.pdf", "application/pdf");
    const big = file("c.png", "image/png", BLOG_IMAGE_MAX_BYTES + 1);
    const res = albumPreflight([ok, pdf, big], 0);
    expect(res.accepted).toEqual([ok]);
    expect(res.rejected).toEqual([
      { name: "b.pdf", reason: "not_image" },
      { name: "c.png", reason: "file_too_large" },
    ]);
  });
  it("лишнее сверх вместимости — album_full", () => {
    const a = file("a.jpg", "image/jpeg");
    const b = file("b.jpg", "image/jpeg");
    const res = albumPreflight([a, b], BLOG_ALBUM_MAX_PHOTOS - 1);
    expect(res.accepted).toEqual([a]);
    expect(res.rejected).toEqual([{ name: "b.jpg", reason: "album_full" }]);
  });
});

describe("albumErrorText", () => {
  it("свои коды и запасной вариант", () => {
    expect(albumErrorText("caption_too_long")).toMatch(/Подпись/);
    expect(albumErrorText("post_not_found")).toMatch(/Пост не найден/);
    expect(albumErrorText("zzz")).toBeTruthy();
  });
});
