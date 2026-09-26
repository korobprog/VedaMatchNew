import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_TTL_MS,
  autosaveKey,
  restoreDraft,
  serializeDraft,
} from "./shloka-autosave";
import { emptyDraft, type ImageDraft, type ShlokaDraft } from "./shloka-draft";

const image: ImageDraft = {
  kind: "existing",
  id: "img-1",
  url: "u",
  width: null,
  height: null,
  removed: false,
};

function edited(): ShlokaDraft {
  return {
    ...emptyDraft("Бхагавад-гита"),
    verse: "2.13",
    translation: "Как воплощённая душа",
    acharyas: [
      {
        key: "a-1",
        id: "ac-1",
        acharya: "Шридхара Свами",
        text: "",
        translation: "",
        wordByWord: "",
        commentary: "толкование",
        images: [image],
      },
    ],
  };
}

describe("autosaveKey", () => {
  it("новая шлока — по рубрике, правка — по шлоке", () => {
    expect(autosaveKey({ kind: "create", categoryId: "cat-1" })).toBe(
      "vedamatch:shloka-draft:new:cat-1",
    );
    expect(autosaveKey({ kind: "edit", shlokaId: "sh-1" })).toBe(
      "vedamatch:shloka-draft:edit:sh-1",
    );
  });
});

describe("restoreDraft", () => {
  it("возвращает текст полей и блоков ачарьев", () => {
    const base = { ...edited(), translation: "", verse: "" };
    const restored = restoreDraft(base, serializeDraft(edited(), 1000), 2000);

    expect(restored?.translation).toBe("Как воплощённая душа");
    expect(restored?.verse).toBe("2.13");
    expect(restored?.acharyas[0]).toMatchObject({
      id: "ac-1",
      acharya: "Шридхара Свами",
      commentary: "толкование",
    });
  });

  it("картинки блока берёт из исходного черновика по id, у нового их нет", () => {
    const withNew = {
      ...edited(),
      acharyas: [
        ...edited().acharyas,
        { ...edited().acharyas[0], key: "a-2", id: null },
      ],
    };
    const restored = restoreDraft(edited(), serializeDraft(withNew, 1), 2);

    expect(restored?.acharyas[0].images).toEqual([image]);
    expect(restored?.acharyas[1].images).toEqual([]);
  });

  it("пустая, битая и устаревшая запись — нечего восстанавливать", () => {
    const base = emptyDraft("");
    expect(restoreDraft(base, null, 1)).toBeNull();
    expect(restoreDraft(base, "{не json", 1)).toBeNull();
    expect(
      restoreDraft(base, JSON.stringify({ translation: "x" }), 1),
    ).toBeNull();
    expect(
      restoreDraft(base, serializeDraft(edited(), 0), AUTOSAVE_TTL_MS + 1),
    ).toBeNull();
  });
});
