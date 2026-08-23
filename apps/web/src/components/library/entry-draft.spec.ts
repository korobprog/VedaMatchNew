import { describe, expect, it } from "vitest";
import {
  buildCreateEntryBody,
  isWizardStepReady,
  validateEntryDraft,
  type LibraryEntryDraft,
} from "./entry-draft";

function draft(over: Partial<LibraryEntryDraft> = {}): LibraryEntryDraft {
  return {
    url: "https://example.com/kirtan",
    type: "video",
    contentLanguage: "ru",
    titleRu: "Как проходит киртан",
    titleEn: "",
    descriptionRu: "",
    descriptionEn: "",
    categoryIds: ["cat-1"],
    ...over,
  };
}

describe("validateEntryDraft", () => {
  it("пропускает заполненный черновик", () => {
    expect(validateEntryDraft(draft())).toBeNull();
  });

  it("требует абсолютный адрес", () => {
    expect(validateEntryDraft(draft({ url: "example.com" }))).toBe(
      "add.unsupportedUrl",
    );
  });

  it("требует заголовок хотя бы на одном языке", () => {
    expect(validateEntryDraft(draft({ titleRu: "  ", titleEn: "" }))).toBe(
      "add.titleRequired",
    );
  });

  it("хватает одного английского заголовка", () => {
    expect(
      validateEntryDraft(draft({ titleRu: "", titleEn: "Kirtan basics" })),
    ).toBeNull();
  });

  it("требует хотя бы одну категорию", () => {
    expect(validateEntryDraft(draft({ categoryIds: [] }))).toBe(
      "add.categoryRequired",
    );
  });

  it("не пускает больше пяти категорий", () => {
    expect(
      validateEntryDraft(draft({ categoryIds: ["1", "2", "3", "4", "5", "6"] })),
    ).toBe("add.tooManyCategories");
  });

  it("ловит слишком длинный заголовок", () => {
    expect(validateEntryDraft(draft({ titleRu: "я".repeat(201) }))).toBe(
      "add.titleTooLong",
    );
  });

  it("ловит слишком длинное описание", () => {
    expect(
      validateEntryDraft(draft({ descriptionRu: "я".repeat(1001) })),
    ).toBe("add.descriptionTooLong");
  });
});

describe("buildCreateEntryBody", () => {
  it("обрезает пробелы и превращает пустое в null", () => {
    expect(
      buildCreateEntryBody(
        draft({
          url: "  https://example.com/kirtan  ",
          titleRu: " Киртан ",
          titleEn: "   ",
          descriptionRu: "",
        }),
      ),
    ).toEqual({
      url: "https://example.com/kirtan",
      type: "video",
      contentLanguage: "ru",
      titleRu: "Киртан",
      titleEn: null,
      descriptionRu: null,
      descriptionEn: null,
      categoryIds: ["cat-1"],
    });
  });
});

describe("isWizardStepReady", () => {
  it("первый шаг ждёт корректный адрес", () => {
    expect(isWizardStepReady(1, draft({ url: "" }))).toBe(false);
    expect(isWizardStepReady(1, draft({ url: "не ссылка" }))).toBe(false);
    expect(isWizardStepReady(1, draft())).toBe(true);
  });

  it("второй шаг ждёт заголовок, а категории ему не важны", () => {
    expect(
      isWizardStepReady(2, draft({ titleRu: "", titleEn: "", categoryIds: [] })),
    ).toBe(false);
    expect(isWizardStepReady(2, draft({ categoryIds: [] }))).toBe(true);
  });

  it("третий шаг ждёт хотя бы одну категорию", () => {
    expect(isWizardStepReady(3, draft({ categoryIds: [] }))).toBe(false);
    expect(isWizardStepReady(3, draft())).toBe(true);
  });

  it("последний шаг проверяет черновик целиком", () => {
    expect(isWizardStepReady(4, draft())).toBe(true);
    expect(isWizardStepReady(4, draft({ url: "битая" }))).toBe(false);
  });
});
