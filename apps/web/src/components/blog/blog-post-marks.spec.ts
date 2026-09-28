import { describe, expect, it } from "vitest";
import {
  blogAudienceFromPost,
  blogAudienceRequestValue,
  blogCategoryRequestValue,
  blogLineageRequestValue,
  blogPostMarksHint,
  toggleBlogAudience,
} from "./blog-post-marks";

describe("blogLineageRequestValue (VED-590)", () => {
  it("«Для всех» уезжает явным all, линия — как есть", () => {
    expect(blogLineageRequestValue("all")).toBe("all");
    expect(blogLineageRequestValue("iskcon")).toBe("iskcon");
  });

  it("пустота и мусор — не выбрано", () => {
    expect(blogLineageRequestValue("")).toBeNull();
    expect(blogLineageRequestValue("group:gaudiya_math")).toBeNull();
  });
});

describe("blogCategoryRequestValue (VED-590)", () => {
  it("категория из списка или не выбрано", () => {
    expect(blogCategoryRequestValue("news")).toBe("news");
    expect(blogCategoryRequestValue("")).toBeNull();
    expect(blogCategoryRequestValue("sport")).toBeNull();
  });
});

describe("blogPostMarksHint (VED-590)", () => {
  const all = "all" as const;

  it("говорит, чего не хватает", () => {
    expect(
      blogPostMarksHint({ category: "", lineage: "", audience: all }),
    ).toBe(
      "Чтобы опубликовать пост, выберите категорию и линию (или «Для всех»).",
    );
    expect(
      blogPostMarksHint({ category: "", lineage: "iskcon", audience: all }),
    ).toBe("Чтобы опубликовать пост, выберите категорию.");
    expect(
      blogPostMarksHint({ category: "news", lineage: "", audience: all }),
    ).toBe("Чтобы опубликовать пост, выберите линию (или «Для всех»).");
    expect(
      blogPostMarksHint(
        { category: "", lineage: "all", audience: all },
        "save",
      ),
    ).toBe("Чтобы сохранить пост, выберите категорию.");
  });

  it("требует и ступень самоидентификации", () => {
    expect(
      blogPostMarksHint({ category: "", lineage: "", audience: null }),
    ).toBe(
      "Чтобы опубликовать пост, выберите категорию, линию и ступень (или «Для всех»).",
    );
    expect(
      blogPostMarksHint({ category: "news", lineage: "all", audience: null }),
    ).toBe("Чтобы опубликовать пост, выберите ступень (или «Для всех»).");
  });

  it("молчит, когда выбрано всё", () => {
    expect(
      blogPostMarksHint({ category: "news", lineage: "all", audience: all }),
    ).toBeNull();
    expect(
      blogPostMarksHint({
        category: "calendar",
        lineage: "ipbys",
        audience: ["yogi"],
      }),
    ).toBeNull();
  });
});

describe("toggleBlogAudience (VED-590)", () => {
  it("«Для всех» и ступени взаимоисключают друг друга", () => {
    expect(toggleBlogAudience(null, "all")).toBe("all");
    expect(toggleBlogAudience("all", "yogi")).toEqual(["yogi"]);
    expect(toggleBlogAudience(["yogi"], "all")).toBe("all");
  });

  it("ступени копятся в порядке пути, снятая последняя — не выбрано", () => {
    expect(toggleBlogAudience(["devotee"], "seeker")).toEqual([
      "seeker",
      "devotee",
    ]);
    expect(toggleBlogAudience(["yogi"], "yogi")).toBeNull();
    expect(toggleBlogAudience("all", "all")).toBeNull();
  });
});

describe("blogAudienceRequestValue и blogAudienceFromPost (VED-590)", () => {
  it("в запрос — all или список, иначе не выбрано", () => {
    expect(blogAudienceRequestValue("all")).toBe("all");
    expect(blogAudienceRequestValue(["yogi"])).toEqual(["yogi"]);
    expect(blogAudienceRequestValue(null)).toBeNull();
    expect(blogAudienceRequestValue([])).toBeNull();
  });

  it("пост без ступеней в правке — «Для всех»", () => {
    expect(blogAudienceFromPost(undefined)).toBe("all");
    expect(blogAudienceFromPost([])).toBe("all");
    expect(blogAudienceFromPost(["seeker"])).toEqual(["seeker"]);
  });
});
