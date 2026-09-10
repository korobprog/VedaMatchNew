import { describe, expect, it } from "vitest";
import type { WorkContactsDto } from "@vedamatch/shared";
import { emptyHint } from "./invite-hints";

const known = (items: WorkContactsDto["items"] = []): WorkContactsDto => ({
  scope: "known",
  items,
  minQuery: null,
});

const portal = (): WorkContactsDto => ({
  scope: "portal",
  items: [],
  minQuery: 2,
});

describe("emptyHint", () => {
  it("обычному человеку до поиска объясняет, откуда возьмутся люди", () => {
    expect(emptyHint(known(), "")).toContain("уже знакомы на портале");
  });

  it("обычному человеку после поиска говорит про знакомых", () => {
    expect(emptyHint(known(), "артем")).toBe(
      "Среди знакомых никого с таким именем.",
    );
  });

  // Администрации нельзя показывать «среди знакомых никого»: она ищет по
  // всему порталу, и такой ответ увёл бы её искать несуществующую дружбу.
  it("администрации говорит про портал, а не про знакомых", () => {
    expect(emptyHint(portal(), "мещеряков")).toBe(
      "На портале никого с таким именем.",
    );
  });

  it("до порога зовёт набрать имя и называет порог", () => {
    expect(emptyHint(portal(), "а")).toBe(
      "Начните вводить имя — ищем по всему порталу от 2 букв.",
    );
  });

  it("пустой запрос у администрации — тоже приглашение набрать", () => {
    expect(emptyHint(portal(), "  ")).toContain("Начните вводить имя");
  });
});
