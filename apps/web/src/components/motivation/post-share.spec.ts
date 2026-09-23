import { describe, expect, it } from "vitest";
import { postShareHref, shareQuoteOf } from "./post-share";

const post = {
  slug: "gita-2-62",
  title: "Бхагавад-гита 2.62",
  text: "Созерцая объекты чувств…\n\nПояснение редакции",
  imageUrl: "https://cdn/x.png",
  storyImageUrl: "https://cdn/x-story.png",
  attributionSpeaker: "Кришна",
  attributionWork: "Бхагавад-гита",
  attributionLocator: "2.62",
};

describe("shareQuoteOf", () => {
  it("делится цитатой без пояснения", () => {
    expect(shareQuoteOf(post)).toBe("Созерцая объекты чувств…");
  });

  it("у открытки без текста берёт заголовок — пустой текст экран не примет", () => {
    expect(shareQuoteOf({ text: "", title: "Бхагавад-гита 2.62" })).toBe("Бхагавад-гита 2.62");
  });
});

describe("postShareHref", () => {
  it("ведёт на портальный экран с картинкой Stories и ссылкой на пост", () => {
    expect(postShareHref(post)).toEqual({
      pathname: "/share",
      query: {
        kind: "story",
        title: "Созерцая объекты чувств…",
        text: "Созерцая объекты чувств…",
        subtitle: "Кришна · Бхагавад-гита · 2.62",
        subtitleInPreview: "1",
        link: "/m/gita-2-62",
        file: "/m/gita-2-62/story",
        previewUrl: "https://cdn/x-story.png",
        sourceService: "motivation",
        sourceId: "gita-2-62",
      },
    });
  });

  it("без картинки Stories показывает обычную, слаг экранирует", () => {
    const { query } = postShareHref({ ...post, slug: "мысль дня", storyImageUrl: "" });
    expect(query.previewUrl).toBe("https://cdn/x.png");
    expect(query.link).toBe("/m/%D0%BC%D1%8B%D1%81%D0%BB%D1%8C%20%D0%B4%D0%BD%D1%8F");
    expect(query.sourceId).toBe("мысль дня");
  });

  it("заголовок превью не длиннее 200 знаков, текст — целиком", () => {
    const long = "а".repeat(250);
    const { query } = postShareHref({ ...post, text: long });
    expect(query.title).toHaveLength(200);
    expect(query.text).toHaveLength(250);
  });
});
