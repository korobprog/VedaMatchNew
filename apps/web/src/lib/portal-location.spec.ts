import { describe, expect, it } from "vitest";
import { portalLocationLabel, portalLocationSlug } from "./portal-location";

describe("portalLocationSlug", () => {
  it("берёт первый сегмент пути", () => {
    expect(portalLocationSlug("/work/boards/1")).toBe("work");
    expect(portalLocationSlug("/music?tab=all")).toBe("music");
    expect(portalLocationSlug("/")).toBe("");
  });

  it("мусор вместо слага — пустая строка", () => {
    expect(portalLocationSlug("/ПУТЬ")).toBe("");
    expect(portalLocationSlug("")).toBe("");
  });
});

describe("portalLocationLabel", () => {
  it("сервис называет по-человечески", () => {
    expect(portalLocationLabel("/work/boards/1")).toBe("Работа");
    expect(portalLocationLabel("/union")).toBe("Знакомства");
  });

  it("имя берётся из каталога, а не из кода: правка в админке доезжает", () => {
    expect(portalLocationLabel("/work", () => "Служение")).toBe("Служение");
  });

  it("разделы самого портала тоже названы", () => {
    expect(portalLocationLabel("/")).toBe("Главная");
    expect(portalLocationLabel("/notifications")).toBe("Уведомления");
  });

  it("незнакомый адрес — «Портал», а не выдуманное название", () => {
    expect(portalLocationLabel("/какая-то-новая-страница")).toBe("Портал");
  });

  it("окно, которое ещё не открывали", () => {
    expect(portalLocationLabel(null)).toBe("Новое окно");
  });
});
