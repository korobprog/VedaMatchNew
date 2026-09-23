import { describe, expect, it } from "vitest";
import { clientHeaders, storyFileName } from "./story-file";

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
