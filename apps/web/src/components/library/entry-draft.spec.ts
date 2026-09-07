import { describe, expect, it } from "vitest";
import {
  buildCreateEntryBody,
  defaultLocator,
  entrySubmitFailure,
  failureText,
  isWizardStepReady,
  validateEntryDraft,
  type LibraryEntryDraft,
} from "./entry-draft";

function draft(over: Partial<LibraryEntryDraft> = {}): LibraryEntryDraft {
  return {
    url: "https://example.com/kirtan",
    source: "",
    locator: "url",
    type: "video",
    contentLanguage: "ru",
    titleRu: "Как проходит киртан",
    titleEn: "",
    descriptionRu: "",
    descriptionEn: "",
    communityId: "",
    lineage: "iskcon",
    categoryIds: ["cat-1"],
    ...over,
  };
}

/** Черновик материала из книги: адреса нет, есть источник. */
function sourceDraft(over: Partial<LibraryEntryDraft> = {}): LibraryEntryDraft {
  return draft({
    locator: "source",
    url: "",
    source: "Бхагавад-гита 9.22",
    type: "book",
    ...over,
  });
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

  it("пропускает материал из книги без адреса", () => {
    expect(validateEntryDraft(sourceDraft())).toBeNull();
  });

  it("требует источник, когда выбран он", () => {
    expect(validateEntryDraft(sourceDraft({ source: "  " }))).toBe(
      "add.sourceRequired",
    );
  });

  it("не придирается к пустому адресу, когда выбран источник", () => {
    // Поле могло остаться заполненным с прошлого положения переключателя —
    // ругать за то, что всё равно не уедет на сервер, незачем.
    expect(
      validateEntryDraft(sourceDraft({ url: "совсем не ссылка" })),
    ).toBeNull();
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
      source: null,
      type: "video",
      contentLanguage: "ru",
      titleRu: "Киртан",
      titleEn: null,
      descriptionRu: null,
      descriptionEn: null,
      categoryIds: ["cat-1"],
      communityId: null,
      lineage: "iskcon",
    });
  });

  it("подпись общиной: пустой выбор уезжает как «от себя»", () => {
    expect(buildCreateEntryBody(draft()).communityId).toBeNull();
    // Пустая линия — «для всех», а не пустая строка в базе.
    expect(buildCreateEntryBody(draft({ lineage: "" })).lineage).toBeNull();
    expect(buildCreateEntryBody(draft({ lineage: "ipbys" })).lineage).toBe(
      "ipbys",
    );
    expect(
      buildCreateEntryBody(draft({ communityId: "c-1" })).communityId,
    ).toBe("c-1");
  });

  it("отправляет только выбранное из двух", () => {
    // Адрес остался с прошлого положения переключателя — на сервер он не
    // уезжает, иначе запись молча получила бы и то, и другое.
    const body = buildCreateEntryBody(
      sourceDraft({ url: "https://example.com/остаток" }),
    );

    expect(body.url).toBeNull();
    expect(body.source).toBe("Бхагавад-гита 9.22");
  });
});

describe("defaultLocator", () => {
  it("книге по умолчанию хватает источника", () => {
    expect(defaultLocator("book")).toBe("source");
  });

  it("остальным типам нужен адрес", () => {
    for (const type of ["video", "website", "article", "audio"] as const)
      expect(defaultLocator(type)).toBe("url");
  });
});

describe("isWizardStepReady", () => {
  it("первый шаг готов всегда — у типа и языка есть значения", () => {
    expect(isWizardStepReady(1, draft({ url: "", titleRu: "" }))).toBe(true);
  });

  it("второй шаг ждёт адрес и заголовок, а категории ему не важны", () => {
    expect(isWizardStepReady(2, draft({ url: "" }))).toBe(false);
    expect(isWizardStepReady(2, draft({ url: "не ссылка" }))).toBe(false);
    expect(
      isWizardStepReady(2, draft({ titleRu: "", titleEn: "", categoryIds: [] })),
    ).toBe(false);
    expect(isWizardStepReady(2, draft({ categoryIds: [] }))).toBe(true);
  });

  it("со включённым источником второй шаг ждёт источник, а не адрес", () => {
    expect(isWizardStepReady(2, sourceDraft({ categoryIds: [] }))).toBe(true);
    expect(isWizardStepReady(2, sourceDraft({ source: "" }))).toBe(false);
    // Битый адрес не мешает: он не уедет на сервер.
    expect(isWizardStepReady(2, sourceDraft({ url: "мусор" }))).toBe(true);
  });

  it("третий шаг ждёт хотя бы одну категорию", () => {
    expect(isWizardStepReady(3, draft({ categoryIds: [] }))).toBe(false);
    expect(isWizardStepReady(3, draft())).toBe(true);
  });

  it("последний шаг проверяет черновик целиком", () => {
    expect(isWizardStepReady(4, draft())).toBe(true);
    expect(isWizardStepReady(4, draft({ url: "битая" }))).toBe(false);
    expect(isWizardStepReady(4, sourceDraft())).toBe(true);
    expect(isWizardStepReady(4, sourceDraft({ source: "" }))).toBe(false);
  });
});

describe("entrySubmitFailure", () => {
  function response(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("переводит известный код 400 в свою строку", async () => {
    const failure = await entrySubmitFailure(
      response(400, { message: "category_not_found" }),
    );
    expect(failure).toEqual({ key: "add.categoryNotFound" });
  });

  it("знает и те коды, что появились в сервисе позже словаря", async () => {
    expect(
      await entrySubmitFailure(response(400, { message: "unsupported_lineage" })),
    ).toEqual({ key: "add.unsupportedLineage" });
    expect(
      await entrySubmitFailure(
        response(400, { message: "url_or_source_required" }),
      ),
    ).toEqual({ key: "add.urlOrSourceRequired" });
  });

  it("незнакомый код 400 показывает сам код", async () => {
    const failure = await entrySubmitFailure(
      response(400, { message: "brand_new_rule" }),
    );
    expect(failure).toEqual({ key: "add.failed", detail: "brand_new_rule" });
  });

  it("различает истёкшую сессию, отказ в правах и лимит", async () => {
    expect(await entrySubmitFailure(response(401))).toEqual({
      key: "add.sessionExpired",
    });
    expect(await entrySubmitFailure(response(403))).toEqual({
      key: "add.forbidden",
    });
    expect(await entrySubmitFailure(response(429))).toEqual({
      key: "add.rateLimited",
    });
  });

  it("ошибку сервера называет ошибкой сервера и показывает код", async () => {
    expect(await entrySubmitFailure(response(500))).toEqual({
      key: "add.serverError",
      detail: "500",
    });
    expect(await entrySubmitFailure(response(502))).toEqual({
      key: "add.serverError",
      detail: "502",
    });
  });

  it("прочие коды доносит числом", async () => {
    expect(await entrySubmitFailure(response(404))).toEqual({
      key: "add.failed",
      detail: "404",
    });
  });
});

describe("failureText", () => {
  it("дописывает код в скобках, когда причина неизвестна", () => {
    expect(failureText("ru", { key: "add.failed", detail: "500" })).toBe(
      "Не удалось добавить ссылку, попробуйте позже (500)",
    );
  });

  it("известную причину оставляет без скобок", () => {
    expect(failureText("ru", { key: "add.categoryNotFound" })).toBe(
      "Одна из категорий больше недоступна",
    );
  });
});
