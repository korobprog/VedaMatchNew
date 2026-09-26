import { describe, expect, it } from "vitest";
import type { LibraryShlokaDto } from "@vedamatch/shared";
import {
  draftError,
  draftFromShloka,
  draftSignature,
  draftToRequest,
  emptyAcharya,
  emptyDraft,
  imagePlan,
  imagesAfterSave,
  type ShlokaDraft,
} from "./shloka-draft";

const file = (name: string) => new File(["x"], name, { type: "image/png" });

function shloka(over: Partial<LibraryShlokaDto> = {}): LibraryShlokaDto {
  return {
    id: "sh-1",
    titleRu: "Бхагавад-гита 2.13",
    source: "Бхагавад-гита",
    verse: "2.13",
    text: "dehino ’smin",
    wordByWord: null,
    translation: "Как душа",
    commentary: null,
    contentLanguage: "ru",
    images: [{ id: "img-1", url: "u", width: 1, height: 1, acharyaId: null }],
    acharyas: [
      {
        id: "ac-1",
        acharya: "Шридхара Свами",
        text: null,
        wordByWord: null,
        translation: null,
        commentary: "толкование",
        images: [
          { id: "img-2", url: "u2", width: 1, height: 1, acharyaId: "ac-1" },
        ],
      },
    ],
    category: null,
    prev: null,
    next: null,
    position: 1,
    total: 1,
    canEdit: true,
    bookmarked: false,
    bookmarkCount: 0,
    commentsCount: 0,
    addedBy: null,
    publishedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  };
}

describe("draftToRequest", () => {
  it("пустые поля уходят null, id блока — только у существующего", () => {
    const draft: ShlokaDraft = {
      ...emptyDraft(" Бхагавад-гита "),
      text: "стих",
      acharyas: [
        { ...emptyAcharya(), acharya: " Рупа ", commentary: "к" },
        { ...emptyAcharya(), id: "ac-9", acharya: "Джива", text: "т" },
      ],
    };
    expect(draftToRequest(draft)).toEqual({
      source: "Бхагавад-гита",
      verse: null,
      text: "стих",
      translation: null,
      wordByWord: null,
      commentary: null,
      acharyas: [
        {
          acharya: "Рупа",
          text: null,
          translation: null,
          wordByWord: null,
          commentary: "к",
        },
        {
          id: "ac-9",
          acharya: "Джива",
          text: "т",
          translation: null,
          wordByWord: null,
          commentary: null,
        },
      ],
    });
  });

  it("черновик из шлоки собирает обратно те же поля", () => {
    const request = draftToRequest(draftFromShloka(shloka()));
    expect(request.verse).toBe("2.13");
    expect(request.acharyas?.[0]).toEqual(
      expect.objectContaining({ id: "ac-1", commentary: "толкование" }),
    );
  });
});

describe("draftError", () => {
  it("проверяет обязательное", () => {
    expect(draftError(emptyDraft(""))).toBe("source_required");
    // Оригинал необязателен, перевод — да (VED-464).
    expect(draftError({ ...emptyDraft("БГ"), text: "стих" })).toBe(
      "translation_required",
    );
    expect(draftError({ ...emptyDraft("БГ"), translation: "перевод" })).toBeNull();
  });

  it("блок ачарьи — имя и хотя бы одно поле", () => {
    const base = { ...emptyDraft("БГ"), translation: "перевод" };
    expect(
      draftError({ ...base, acharyas: [{ ...emptyAcharya(), text: "т" }] }),
    ).toBe("acharya_name_required");
    expect(
      draftError({ ...base, acharyas: [{ ...emptyAcharya(), acharya: "А" }] }),
    ).toBe("acharya_empty");
  });

  it("не больше 12 картинок, убранные не считаются", () => {
    const images = Array.from({ length: 13 }, (_, index) => ({
      kind: "existing" as const,
      id: `i${index}`,
      url: "u",
      width: null,
      height: null,
      removed: index === 0,
    }));
    const draft = { ...emptyDraft("БГ"), translation: "перевод", images };
    expect(imagesAfterSave(draft)).toBe(12);
    expect(draftError(draft)).toBeNull();
    expect(
      draftError({
        ...draft,
        images: [
          ...images,
          { kind: "new", key: "n", file: file("a.png"), previewUrl: "blob:" },
        ],
      }),
    ).toBe("too_many_images");
  });
});

describe("imagePlan", () => {
  it("новые грузит к шлоке и к блокам по их id из ответа, убранные снимает", () => {
    const draft = draftFromShloka(shloka());
    const a = file("a.png");
    const b = file("b.png");
    draft.images[0] = { ...draft.images[0], removed: true } as never;
    draft.images.push({ kind: "new", key: "n1", file: a, previewUrl: "blob:a" });
    draft.acharyas.push({
      ...emptyAcharya(),
      acharya: "Новый",
      text: "т",
      images: [{ kind: "new", key: "n2", file: b, previewUrl: "blob:b" }],
    });

    expect(imagePlan(draft, ["ac-1", "ac-new"])).toEqual({
      uploads: [
        { file: a, acharyaId: null },
        { file: b, acharyaId: "ac-new" },
      ],
      removals: ["img-1"],
    });
  });

  it("блока нет в ответе — его картинки не грузятся", () => {
    const draft = emptyDraft("БГ");
    draft.acharyas.push({
      ...emptyAcharya(),
      images: [{ kind: "new", key: "n", file: file("c.png"), previewUrl: "" }],
    });
    expect(imagePlan(draft, []).uploads).toEqual([]);
  });
});

describe("draftSignature", () => {
  it("меняется от правки текста и от картинок, но не от пробелов по краям", () => {
    const draft = draftFromShloka(shloka());
    const before = draftSignature(draft);
    expect(draftSignature({ ...draft, translation: "Как душа  " })).toBe(before);
    expect(draftSignature({ ...draft, translation: "Иначе" })).not.toBe(before);
    expect(
      draftSignature({
        ...draft,
        images: [{ ...draft.images[0], removed: true } as never],
      }),
    ).not.toBe(before);
  });
});
