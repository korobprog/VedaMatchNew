import { describe, expect, it } from "vitest";
import { pastedNewsImages, pickNewsUploads } from "./news-images";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("pastedNewsImages (VED-137)", () => {
  it("берёт из буфера только картинки", () => {
    const shot = file("image.png", "image/png");
    expect(pastedNewsImages([shot, file("notes.txt", "text/plain")])).toEqual([shot]);
  });

  it("пустой буфер — пустой список", () => {
    expect(pastedNewsImages(null)).toEqual([]);
    expect(pastedNewsImages(undefined)).toEqual([]);
  });
});

describe("pickNewsUploads (VED-137)", () => {
  it("пропускает подходящие файлы", () => {
    const a = file("a.jpg", "image/jpeg");
    const b = file("b.webp", "image/webp");
    expect(pickNewsUploads([a, b], 0, 6)).toEqual({ upload: [a, b], rejected: [] });
  });

  it("не тот формат — отказ с понятной причиной", () => {
    const result = pickNewsUploads([file("scan.heic", "image/heic")], 0, 6);
    expect(result.upload).toEqual([]);
    expect(result.rejected).toEqual(["scan.heic: подходят JPG, PNG и WebP"]);
  });

  it("считает место от уже прикреплённых картинок", () => {
    const a = file("a.png", "image/png");
    const b = file("b.png", "image/png");
    const result = pickNewsUploads([a, b], 5, 6);
    expect(result.upload).toEqual([a]);
    expect(result.rejected).toEqual(["b.png: не больше 6 картинок в новости"]);
  });
});
