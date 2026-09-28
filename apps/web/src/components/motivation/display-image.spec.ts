import { describe, expect, it } from "vitest";
import { displayImageUrl } from "./display-image";

describe("displayImageUrl", () => {
  it("берёт лёгкую копию, когда она есть", () => {
    expect(
      displayImageUrl({
        imageUrl: "https://cdn/v1.png",
        imageThumbUrl: "https://cdn/v1-w720.webp",
      }),
    ).toBe("https://cdn/v1-w720.webp");
  });

  it("без копии — оригинал", () => {
    expect(
      displayImageUrl({ imageUrl: "https://cdn/v1.png", imageThumbUrl: "" }),
    ).toBe("https://cdn/v1.png");
    expect(
      displayImageUrl({ imageUrl: "https://cdn/v1.png", imageThumbUrl: null }),
    ).toBe("https://cdn/v1.png");
    expect(displayImageUrl({ imageUrl: "https://cdn/v1.png" })).toBe(
      "https://cdn/v1.png",
    );
    expect(
      displayImageUrl({ imageUrl: "https://cdn/v1.png", imageThumbUrl: "  " }),
    ).toBe("https://cdn/v1.png");
  });

  it("пустой пост так и остаётся пустым", () => {
    expect(displayImageUrl({ imageUrl: "" })).toBe("");
  });
});
