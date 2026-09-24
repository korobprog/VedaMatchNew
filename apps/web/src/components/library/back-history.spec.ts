import { describe, expect, it } from "vitest";
import { isLibraryFormPath, shouldSkipOnBack } from "./back-history";

describe("isLibraryFormPath", () => {
  it("узнаёт выбор режима и все формы добавления", () => {
    expect(isLibraryFormPath("/library/add")).toBe(true);
    expect(isLibraryFormPath("/library/add/simple")).toBe(true);
    expect(isLibraryFormPath("/library/add/pro")).toBe(true);
    expect(isLibraryFormPath("/library/add/shloka")).toBe(true);
  });

  it("не путает с рубрикой, чей слаг начинается на add", () => {
    expect(isLibraryFormPath("/library/address")).toBe(false);
    expect(isLibraryFormPath("/library/propovedniki")).toBe(false);
    expect(isLibraryFormPath("/library/entry/e1")).toBe(false);
    expect(isLibraryFormPath("/library")).toBe(false);
  });
});

describe("shouldSkipOnBack", () => {
  it("проходит форму насквозь", () => {
    expect(shouldSkipOnBack("/library/add", "/library/propovedniki")).toBe(true);
  });

  // «рубрика → форма → рубрика»: иначе «Назад» вернул бы в ту же рубрику.
  it("проходит ту же страницу, с которой нажали", () => {
    expect(
      shouldSkipOnBack("/library/propovedniki", "/library/propovedniki"),
    ).toBe(true);
  });

  it("из формы возвращает к выбору режима, а не мимо него", () => {
    expect(shouldSkipOnBack("/library/add", "/library/add/simple")).toBe(false);
  });

  it("останавливается на другой странице", () => {
    expect(shouldSkipOnBack("/library", "/library/propovedniki")).toBe(false);
    expect(shouldSkipOnBack("/library/entry/e1", "/library/guru")).toBe(false);
  });
});
