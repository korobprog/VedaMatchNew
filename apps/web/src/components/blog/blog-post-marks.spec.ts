import { describe, expect, it } from "vitest";
import {
  blogCategoryRequestValue,
  blogLineageRequestValue,
  blogPostMarksHint,
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
  it("говорит, чего не хватает", () => {
    expect(blogPostMarksHint("", "")).toBe(
      "Чтобы опубликовать пост, выберите категорию и линию (или «Для всех»).",
    );
    expect(blogPostMarksHint("", "iskcon")).toBe(
      "Чтобы опубликовать пост, выберите категорию.",
    );
    expect(blogPostMarksHint("news", "")).toBe(
      "Чтобы опубликовать пост, выберите линию (или «Для всех»).",
    );
    expect(blogPostMarksHint("", "all", "save")).toBe(
      "Чтобы сохранить пост, выберите категорию.",
    );
  });

  it("молчит, когда выбрано всё", () => {
    expect(blogPostMarksHint("news", "all")).toBeNull();
    expect(blogPostMarksHint("calendar", "ipbys")).toBeNull();
  });
});
