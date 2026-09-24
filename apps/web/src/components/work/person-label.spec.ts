import { describe, expect, it } from "vitest";
import {
  workActorLabel,
  workPersonLabel,
  workPersonShortLabel,
} from "./person-label";

describe("workPersonLabel", () => {
  it("агента помечает, человека оставляет как есть", () => {
    expect(workPersonLabel({ name: "Севак", isAgent: true })).toBe(
      "Севак · ИИ",
    );
    expect(workPersonLabel({ name: "Стас", isAgent: false })).toBe("Стас");
  });

  it("пометка идёт после имени: списки читаются по первой букве", () => {
    expect(workPersonLabel({ name: "Севак", isAgent: true })).toMatch(/^Севак/);
  });

  it("без исполнителя подпись пустая, а не «null»", () => {
    expect(workPersonLabel(null)).toBe("");
    expect(workPersonLabel(undefined)).toBe("");
  });
});

describe("workActorLabel", () => {
  it("агент показывается вместе с тем, чьим ключом ходил", () => {
    expect(
      workActorLabel({ name: "Севак", isAgent: true }, { name: "Маму" }),
    ).toBe("Севак · ИИ, по поручению: Маму");
  });

  it("у человека поручителя не бывает — подпись остаётся именем", () => {
    expect(workActorLabel({ name: "Стас", isAgent: false }, null)).toBe("Стас");
  });

  it("агент без поручителя не превращается в «по поручению никого»", () => {
    expect(workActorLabel({ name: "Севак", isAgent: true }, null)).toBe(
      "Севак · ИИ",
    );
  });
});

describe("workPersonShortLabel (VED-431)", () => {
  it("первое слово имени, агент с пометкой", () => {
    expect(
      workPersonShortLabel({ name: "Станислав Санкаршан", isAgent: false }),
    ).toBe("Станислав");
    expect(workPersonShortLabel({ name: "Севак", isAgent: true })).toBe(
      "Севак · ИИ",
    );
  });

  it("без исполнителя — пусто", () => {
    expect(workPersonShortLabel(null)).toBe("");
  });
});
