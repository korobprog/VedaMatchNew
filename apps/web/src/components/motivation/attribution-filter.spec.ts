import { describe, expect, it } from "vitest";
import {
  attributionFields,
  attributionsQuery,
  filterHref,
  hasAttributionFilter,
  sameAttribution,
} from "./attribution-filter";
import { reelsHref } from "./feed-style";

describe("sameAttribution", () => {
  it("не различает регистр, пробелы и тире", () => {
    expect(sameAttribution("бхагавад–гита ", "Бхагавад-гита")).toBe(true);
    expect(sameAttribution("Шрила  Прабхупада", "шрила прабхупада.")).toBe(true);
  });

  it("разные книги и пустые значения не совпадают", () => {
    expect(sameAttribution("Бхагавад-гита", "Шримад-Бхагаватам")).toBe(false);
    expect(sameAttribution("", "")).toBe(false);
    expect(sameAttribution(undefined, null)).toBe(false);
  });
});

describe("filterHref", () => {
  const state = { tab: "cards" as const, order: "random" as const, category: "vedy" };

  it("сохраняет вкладку, порядок и папку", () => {
    expect(filterHref(state, { work: "Бхагавад-гита" })).toBe(
      "/motivation?tab=cards&category=vedy&work=%D0%91%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4-%D0%B3%D0%B8%D1%82%D0%B0&order=random",
    );
  });

  it("меняет одно измерение и не трогает другое", () => {
    const href = filterHref({ ...state, speaker: "Прабхупада", work: "Гита" }, { work: null });
    const query = new URL(href, "https://x").searchParams;
    expect(query.get("speaker")).toBe("Прабхупада");
    expect(query.has("work")).toBe(false);
  });

  it("сброс обоих — лента той же вкладки и папки", () => {
    expect(filterHref({ ...state, speaker: "A", work: "B" }, { speaker: null, work: null })).toBe(
      "/motivation?tab=cards&category=vedy&order=random",
    );
  });

  it("из избранного ведёт в «Для вас»", () => {
    expect(filterHref({ tab: "saved" }, { work: "Гита" })).toBe(
      reelsHref({ work: "Гита" }),
    );
  });
});

describe("reelsHref с фильтрами", () => {
  it("кладёт автора и источник в адрес, пустые — нет", () => {
    const query = new URL(reelsHref({ speaker: " Вьясадева ", work: "  " }), "https://x").searchParams;
    expect(query.get("speaker")).toBe("Вьясадева");
    expect(query.has("work")).toBe(false);
  });

  it("у избранного фильтров нет", () => {
    expect(reelsHref({ tab: "saved", work: "Гита" })).toBe("/motivation?tab=saved");
  });
});

describe("attributionsQuery", () => {
  it("передаёт папку, стиль вкладки и выбранное", () => {
    const query = new URLSearchParams(
      attributionsQuery({ tab: "forYou", category: "vedy", speaker: "A", work: "B" }),
    );
    expect(Object.fromEntries(query)).toEqual({
      category: "vedy",
      style: "art",
      speaker: "A",
      work: "B",
    });
  });

  it("у избранного стиля нет", () => {
    expect(attributionsQuery({ tab: "saved" })).toBe("");
  });
});

describe("hasAttributionFilter", () => {
  it("пробелы фильтром не считаются", () => {
    expect(hasAttributionFilter({ speaker: " " })).toBe(false);
    expect(hasAttributionFilter({ work: "Гита" })).toBe(true);
  });
});

describe("attributionFields", () => {
  it("раскладывает подпись по ролям", () => {
    expect(
      attributionFields({
        attributionSpeaker: " Кришна ",
        attributionWork: "Бхагавад-гита",
        attributionLocator: "Бхагавад-гита 2.47",
      }),
    ).toEqual([
      { kind: "speaker", text: "Кришна" },
      { kind: "work", text: "Бхагавад-гита" },
      { kind: "locator", text: "2.47" },
    ]);
  });

  it("пустые графы пропускает", () => {
    expect(
      attributionFields({ attributionSpeaker: null, attributionWork: " ", attributionLocator: "3.1" }),
    ).toEqual([{ kind: "locator", text: "3.1" }]);
  });
});
