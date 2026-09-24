import { describe, expect, it } from "vitest";
import {
  SAVED_GALLERY_MAX,
  addSavedPicture,
  galleryCaption,
  parseSavedGallery,
  type SavedPicture,
} from "./saved-gallery";

const picture = (slug: string, savedAt = 1): SavedPicture => ({
  file: `/m/${slug}/story`,
  sharePath: `/share?text=x&link=/m/${slug}`,
  thumb: `/m/${slug}/story`,
  text: `Цитата ${slug}`,
  savedAt,
});

describe("addSavedPicture (VED-353)", () => {
  it("новую — первой, повторную — наверх без дубля", () => {
    const list = addSavedPicture(
      addSavedPicture([], picture("a")),
      picture("b"),
    );
    expect(list.map((item) => item.file)).toEqual(["/m/b/story", "/m/a/story"]);
    const again = addSavedPicture(list, picture("a", 5));
    expect(again.map((item) => item.file)).toEqual([
      "/m/a/story",
      "/m/b/story",
    ]);
    expect(again[0].savedAt).toBe(5);
  });

  it("не хранит больше предела", () => {
    let list: SavedPicture[] = [];
    for (let index = 0; index < SAVED_GALLERY_MAX + 5; index += 1)
      list = addSavedPicture(list, picture(`p${index}`));
    expect(list).toHaveLength(SAVED_GALLERY_MAX);
    expect(list[0].file).toBe(`/m/p${SAVED_GALLERY_MAX + 4}/story`);
  });

  it("чужую миниатюру заменяет самим файлом", () => {
    const [entry] = addSavedPicture([], {
      ...picture("a"),
      thumb: "javascript:alert(1)",
    });
    expect(entry.thumb).toBe("/m/a/story");
    const [signed] = addSavedPicture([], {
      ...picture("b"),
      thumb: "https://s3.example/preview.webp",
    });
    expect(signed.thumb).toBe("https://s3.example/preview.webp");
  });
});

describe("parseSavedGallery", () => {
  it("битое и пустое — пустой список", () => {
    expect(parseSavedGallery(null)).toEqual([]);
    expect(parseSavedGallery("{")).toEqual([]);
    expect(parseSavedGallery('{"a":1}')).toEqual([]);
  });

  it("пропускает чужие адреса и дубли", () => {
    const raw = JSON.stringify([
      picture("a"),
      { ...picture("b"), file: "https://evil/x.jpg" },
      { ...picture("c"), sharePath: "//evil" },
      picture("a"),
      null,
    ]);
    expect(parseSavedGallery(raw).map((item) => item.file)).toEqual([
      "/m/a/story",
    ]);
  });

  it("переживает круг записи и чтения", () => {
    const list = addSavedPicture([], picture("a"));
    expect(parseSavedGallery(JSON.stringify(list))).toEqual(list);
  });
});

describe("galleryCaption", () => {
  it("сжимает пробелы и обрезает длинный текст", () => {
    expect(galleryCaption("  раз \n два  ")).toBe("раз два");
    const long = galleryCaption("слово ".repeat(60));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith("…")).toBe(true);
  });
});
