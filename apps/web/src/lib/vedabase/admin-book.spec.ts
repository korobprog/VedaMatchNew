import { describe, expect, it } from "vitest";
import type { VedabaseAdminBook } from "@vedamatch/shared";
import { bookPatch, draftOf, toggleIn } from "./admin-book";

const book: VedabaseAdminBook = {
  slug: "isopanishad",
  title: "Шри Ишопанишад",
  author: "Прабхупада",
  kind: "scripture",
  audienceStages: ["seeker", "devotee"],
  lineages: ["iskcon"],
  blocked: false,
  chapterCount: 18,
  active: true,
};

/* VED-662: админка книг Библиотеки. */
describe("bookPatch", () => {
  it("без изменений — пусто, порядок в списках не в счёт", () => {
    const draft = draftOf(book);
    draft.audienceStages = ["devotee", "seeker"];
    draft.title = " Шри Ишопанишад ";
    expect(bookPatch(book, draft)).toEqual({});
  });

  it("только изменённые поля; пустой автор — null", () => {
    const draft = {
      ...draftOf(book),
      author: "  ",
      lineages: [],
      blocked: true,
    };
    expect(bookPatch(book, draft)).toEqual({
      author: null,
      lineages: [],
      blocked: true,
    });
  });
});

describe("toggleIn", () => {
  it("добавляет и убирает", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});
