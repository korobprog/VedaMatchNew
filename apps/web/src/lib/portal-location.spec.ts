import { describe, expect, it } from "vitest";
import {
  PORTAL_LOCATION_LIMIT,
  portalLocation,
  portalLocationLabel,
  portalLocationSlug,
  portalLocationStep,
  portalLocationTitle,
  shortenPortalLocation,
} from "./portal-location";

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

describe("portalLocationStep", () => {
  it("берёт второй сегмент", () => {
    expect(portalLocationStep("/work/boards/1")).toBe("boards");
    expect(portalLocationStep("/music/playlists?tab=all")).toBe("playlists");
    expect(portalLocationStep("/work")).toBe("");
  });
});

describe("portalLocation", () => {
  it("сервис называет по-человечески", () => {
    expect(portalLocation("/union")).toEqual({ root: "Знакомства", step: null });
  });

  it("имя берётся из каталога, а не из кода: правка в админке доезжает", () => {
    expect(portalLocation("/work", () => "Служение").root).toBe("Служение");
  });

  it("разделы самого портала тоже названы", () => {
    expect(portalLocation("/")).toEqual({ root: "Главная", step: null });
    expect(portalLocation("/notifications").root).toBe("Уведомления");
  });

  it("VED-374: Блог-лента опознаётся, а не зовётся «Порталом»", () => {
    expect(portalLocation("/blog")).toEqual({ root: "Блог", step: null });
    expect(portalLocation("/blog/authors/42")).toEqual({
      root: "Блог",
      step: "Авторы",
    });
  });

  it("VED-374: ступень внутри сервиса", () => {
    expect(portalLocation("/work/boards/7")).toEqual({
      root: "Работа",
      step: "Доска",
    });
    expect(portalLocation("/music/playlists")).toEqual({
      root: "Музыка",
      step: "Плейлисты",
    });
  });

  it("незнакомая ступень не показывается: на втором месте бывает номер", () => {
    expect(portalLocation("/chat/8f21ab")).toEqual({
      root: "Общение",
      step: null,
    });
    expect(portalLocation("/notices/1487")).toEqual({
      root: "Объявления",
      step: null,
    });
  });

  it("незнакомый адрес — «Портал», а не выдуманное название", () => {
    expect(portalLocation("/kakaya-to-novaya-stranica")).toEqual({
      root: "Портал",
      step: null,
    });
  });

  it("у неопознанного корня ступень не выдумывается", () => {
    expect(portalLocation("/nechto/boards")).toEqual({
      root: "Портал",
      step: null,
    });
  });

  it("окно, которое ещё не открывали", () => {
    expect(portalLocation(null)).toEqual({ root: "Новое окно", step: null });
  });
});

describe("portalLocationTitle", () => {
  it("в подсказке место названо целиком", () => {
    expect(portalLocationTitle("/motivation/collections")).toBe(
      "Вдохновение · Картинки",
    );
    expect(portalLocationTitle("/blog")).toBe("Блог");
  });
});

describe("shortenPortalLocation", () => {
  it("помещается целиком — показываем целиком", () => {
    expect(shortenPortalLocation("Работа", "Доска", 14)).toBe("Работа · Доска");
  });

  it("не помещается — выбрасываем начало, ступень остаётся", () => {
    expect(shortenPortalLocation("Вдохновение", "Картинки", 14)).toBe(
      "Картинки",
    );
  });

  it("длинная ступень режется с конца многоточием", () => {
    expect(shortenPortalLocation("Астрология", "Совместимость", 10)).toBe(
      "Совместим…",
    );
  });

  it("пробел перед многоточием не остаётся", () => {
    expect(shortenPortalLocation("Портал", "Кого найти", 6)).toBe("Кого…");
  });

  it("корень без ступени тоже режется, а не переносится", () => {
    expect(shortenPortalLocation("Добро пожаловать", null, 14)).toBe(
      "Добро пожалов…",
    );
  });
});

describe("portalLocationLabel", () => {
  it("VED-374: ступень видна, корневого сервиса одного мало", () => {
    expect(portalLocationLabel("/blog/authors/42")).toBe("Блог · Авторы");
    expect(portalLocationLabel("/work/planner/1")).toBe("Планировщик");
  });

  it("подпись не длиннее предела: иначе съезжает значок окна", () => {
    const urls = [
      "/blog",
      "/blog/authors/42",
      "/astro/compatibility",
      "/motivation/collections",
      "/music/audiobooks",
      "/work/planner/1",
      "/union/recommendations",
      "/welcome",
      "/wellness/products/4601234567890",
      null,
    ];
    for (const url of urls) {
      expect(portalLocationLabel(url).length).toBeLessThanOrEqual(
        PORTAL_LOCATION_LIMIT,
      );
    }
  });

  it("длинное имя из каталога тоже укладывается в строку", () => {
    expect(
      portalLocationLabel("/work", () => "Совместное служение").length,
    ).toBeLessThanOrEqual(PORTAL_LOCATION_LIMIT);
  });
});
