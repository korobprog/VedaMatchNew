import { describe, expect, it } from "vitest";
import { categoryPageTitle, pageTitleFormValues } from "./category-page-title";

const AUTHOR = {
  titleRu: "Е. С. Бхактивигьяна Г. М.",
  titleEn: "H. H. Bhakti Vijnana Goswami",
};

describe("categoryPageTitle (VED-394)", () => {
  it("без своего заголовка — название рубрики", () => {
    expect(categoryPageTitle("ru", AUTHOR)).toBe("Е. С. Бхактивигьяна Г. М.");
    expect(
      categoryPageTitle("ru", {
        ...AUTHOR,
        pageTitleRu: null,
        pageTitleEn: null,
      }),
    ).toBe("Е. С. Бхактивигьяна Г. М.");
  });

  it("свой заголовок на языке интерфейса важнее названия", () => {
    const category = { ...AUTHOR, pageTitleRu: "Бхактивигьяна Госвами" };
    expect(categoryPageTitle("ru", category)).toBe("Бхактивигьяна Госвами");
    // Английский заголовок не задан — на английском остаётся название.
    expect(categoryPageTitle("en", category)).toBe(
      "H. H. Bhakti Vijnana Goswami",
    );
  });

  it("форма открывается с тем, что сейчас в заголовке", () => {
    expect(
      pageTitleFormValues({ ...AUTHOR, pageTitleRu: "Бхактивигьяна Госвами" }),
    ).toEqual({
      ru: "Бхактивигьяна Госвами",
      en: "H. H. Bhakti Vijnana Goswami",
    });
    expect(pageTitleFormValues({ titleRu: null, titleEn: null })).toEqual({
      ru: "",
      en: "",
    });
  });
});
