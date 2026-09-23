import { describe, expect, it } from "vitest";
import {
  arrowTarget,
  shlokaHref,
  shlokaSectionMode,
  shlokaSourcesInTree,
  verseExcerpt,
  verseLines,
} from "./shloka-mode";

const node = (titleRu: string | null, titleEn: string | null = null) => ({
  titleRu,
  titleEn,
});

describe("shlokaSectionMode", () => {
  it("рубрика «Шлоки» без своих шлок — корень разделов", () => {
    expect(
      shlokaSectionMode({ category: node("ШЛОКИ"), ancestors: [], shlokaTotal: 0 }),
    ).toBe("root");
    expect(
      shlokaSectionMode({
        category: node(null, "Shlokas"),
        ancestors: [],
        shlokaTotal: 0,
      }),
    ).toBe("root");
  });

  it("раздел внутри «Шлок» — источник, даже пустой", () => {
    expect(
      shlokaSectionMode({
        category: node("Бхагавад-гита"),
        ancestors: [node("ШЛОКИ")],
        shlokaTotal: 0,
      }),
    ).toBe("source");
  });

  it("рубрика, где шлоки уже есть, — источник где бы она ни была", () => {
    expect(
      shlokaSectionMode({
        category: node("Ачарьи"),
        ancestors: [],
        shlokaTotal: 3,
      }),
    ).toBe("source");
  });

  it("обычная рубрика — обычная страница", () => {
    expect(
      shlokaSectionMode({
        category: node("Лекции"),
        ancestors: [node("Ачарьи")],
        shlokaTotal: 0,
      }),
    ).toBeNull();
  });
});

describe("verseLines", () => {
  it("делит оригинал и транслитерацию, схлопывая пустые строки", () => {
    expect(
      verseLines("\nदेहिनोऽस्मिन्\r\nयथा देहे\n\n\n\ndehino 'smin\n  \n"),
    ).toEqual([
      { kind: "devanagari", text: "देहिनोऽस्मिन्" },
      { kind: "devanagari", text: "यथा देहे" },
      { kind: "blank" },
      { kind: "roman", text: "dehino 'smin" },
    ]);
  });

  it("кириллическая транслитерация — как латиница", () => {
    expect(verseLines("дехино 'смин")).toEqual([
      { kind: "roman", text: "дехино 'смин" },
    ]);
  });
});

describe("verseExcerpt", () => {
  it("берёт первые непустые строки", () => {
    expect(verseExcerpt("a\n\nb\nc", 2)).toBe("a\nb");
  });
});

describe("shlokaHref", () => {
  it("ведёт на страницу материала, в правку — с параметром", () => {
    expect(shlokaHref("x y")).toBe("/library/entry/x%20y");
    expect(shlokaHref("id", true)).toBe("/library/entry/id?mode=edit");
  });
});

describe("arrowTarget", () => {
  const key = (k: string, over: Partial<Parameters<typeof arrowTarget>[0]> = {}) =>
    arrowTarget({
      key: k,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: null,
      ...over,
    });

  it("стрелки влево и вправо листают", () => {
    expect(key("ArrowLeft")).toBe("prev");
    expect(key("ArrowRight")).toBe("next");
    expect(key("ArrowUp")).toBeNull();
  });

  it("не мешает полям ввода и сочетаниям клавиш", () => {
    const input = document.createElement("textarea");
    expect(key("ArrowLeft", { target: input })).toBeNull();
    expect(key("ArrowLeft", { altKey: true })).toBeNull();
    expect(key("ArrowRight", { metaKey: true })).toBeNull();
  });
});

describe("shlokaSourcesInTree", () => {
  const tree = (titleRu: string, slug: string, children: never[] = []) => ({
    titleRu,
    titleEn: null,
    slug,
    children,
  });

  it("собирает всё внутри рубрик «Шлоки» с путём", () => {
    const sources = shlokaSourcesInTree(
      [
        tree("Ачарьи", "acharyas", [tree("Рупа", "rupa")] as never[]),
        tree("ШЛОКИ", "shloki", [
          tree("Бхагавад-гита", "bg"),
          tree("Шримад-Бхагаватам", "sb", [tree("Песнь 1", "sb-1")] as never[]),
        ] as never[]),
      ],
      (row) => row.titleRu ?? "",
    );
    expect(sources).toEqual([
      { slug: "bg", label: "Бхагавад-гита" },
      { slug: "sb", label: "Шримад-Бхагаватам" },
      { slug: "sb-1", label: "Шримад-Бхагаватам / Песнь 1" },
    ]);
  });
});
