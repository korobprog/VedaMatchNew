import { describe, expect, it } from "vitest";
import {
  clientHeaders,
  savedImageApiPath,
  storyFileName,
  storyQuality,
} from "./story-file";

describe("storyFileName", () => {
  it("называет файл по слагу и настоящему типу", () => {
    expect(storyFileName("reel-33e14d6e-mu376h10", "image/jpeg")).toBe(
      "vedamatch-reel-33e14d6e-mu376h10.jpg",
    );
    expect(storyFileName("post", "image/png")).toBe("vedamatch-post.png");
    expect(storyFileName("post", "image/webp; charset=binary")).toBe("vedamatch-post.webp");
  });

  it("неизвестный тип — jpg, мусор из слага в имя не попадает", () => {
    expect(storyFileName('a"b/../c', null)).toBe("vedamatch-a-b-c.jpg");
    expect(storyFileName("", "image/jpeg")).toBe("vedamatch-card.jpg");
  });
});

describe("clientHeaders", () => {
  it("пробрасывает адрес клиента и ничего лишнего", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7",
      cookie: "access_token=secret",
    });
    expect(clientHeaders(headers)).toEqual({ "x-forwarded-for": "203.0.113.7" });
  });
});

describe("качество файла (VED-156)", () => {
  it("пропускает только белый список, остальное — лёгкое", () => {
    expect(storyQuality("standard")).toBe("standard");
    expect(storyQuality("max")).toBe("max");
    expect(storyQuality("light")).toBe("light");
    expect(storyQuality(null)).toBe("light");
    expect(storyQuality("MAX")).toBe("light");
    expect(storyQuality("max&x=1")).toBe("light");
  });

  it("у каждого качества своё имя файла, лёгкое — прежнее", () => {
    expect(storyFileName("post", "image/jpeg", "light")).toBe("vedamatch-post.jpg");
    expect(storyFileName("post", "image/jpeg", "standard")).toBe("vedamatch-post-hq.jpg");
    expect(storyFileName("post", "image/png", "max")).toBe("vedamatch-post-max.png");
  });

  it("лёгкое уходит в API без параметра, остальные — с ним", () => {
    expect(savedImageApiPath("a b", "light")).toBe("/motivation/posts/a%20b/saved-image");
    expect(savedImageApiPath("post", "max")).toBe("/motivation/posts/post/saved-image?q=max");
  });
});
