import { describe, expect, it } from "vitest";
import {
  SIDE_MENU_SERVICES,
  defaultSideMenu,
  moveSideMenuItem,
  parseSideMenuConfig,
  resolveSideMenu,
  serializeSideMenuConfig,
  sideMenuHotkeys,
  toggleSideMenuItem,
  type SideMenuConfig,
} from "./side-menu-config";
import { quickActionCatalog } from "./quick-actions";

const A = "service:union";
const B = "service:chat";
const C = "service:work";
const SERVICES = [A, B, C];
const KNOWN = new Set([...SERVICES, "search", "bookmarks", "custom:/music/1"]);

const resolve = (config: SideMenuConfig) => resolveSideMenu(config, KNOWN, SERVICES);

describe("parseSideMenuConfig", () => {
  it("без записи — все сервисы портала по порядку", () => {
    expect(parseSideMenuConfig(null)).toEqual({
      ids: [...SIDE_MENU_SERVICES],
      hidden: [],
    });
  });

  it("мусор и чужая версия не оставляют без меню", () => {
    const fallback = defaultSideMenu();
    expect(parseSideMenuConfig("не json")).toEqual(fallback);
    expect(parseSideMenuConfig("null")).toEqual(fallback);
    expect(parseSideMenuConfig('{"v":99,"ids":[]}')).toEqual(fallback);
    expect(parseSideMenuConfig('{"v":1,"ids":"x"}')).toEqual(fallback);
  });

  it("переживает запись и чтение, дубли и нестроки выбрасывает", () => {
    const config = { ids: [B, "search", A], hidden: [C] };
    expect(parseSideMenuConfig(serializeSideMenuConfig(config))).toEqual(config);
    expect(
      parseSideMenuConfig('{"v":1,"ids":["search","search",5,null],"hidden":[1]}'),
    ).toEqual({ ids: ["search"], hidden: [] });
  });

  it("спрятанной бывает только сервисная строка, и не видимая одновременно", () => {
    expect(
      parseSideMenuConfig(
        JSON.stringify({ v: 1, ids: [A], hidden: [A, B, "search"] }),
      ),
    ).toEqual({ ids: [A], hidden: [B] });
  });
});

describe("resolveSideMenu", () => {
  it("по умолчанию — все сервисы", () => {
    expect(resolve(defaultSideMenu(SERVICES))).toEqual(SERVICES);
  });

  it("новый сервис дописывается в конец, спрятанный остаётся спрятанным", () => {
    // Человек настроил меню, когда сервиса C ещё не было, и спрятал B.
    expect(resolve({ ids: ["search", A], hidden: [B] })).toEqual([
      "search",
      A,
      C,
    ]);
  });

  it("исчезнувшие строки пропускает молча", () => {
    expect(
      resolve({ ids: ["custom:/gone", A, "service:выдумка", B], hidden: [] }),
    ).toEqual([A, B, C]);
  });
});

describe("toggleSideMenuItem", () => {
  // VED-429: «они всегда добавлялись в самый верх под кнопку Главная».
  it("прячет сервис и возвращает его в самый верх, под «Главную»", () => {
    const start = defaultSideMenu(SERVICES);
    const hidden = toggleSideMenuItem(start, resolve(start), C);
    expect(hidden).toEqual({ ids: [A, B], hidden: [C] });
    expect(resolve(hidden)).toEqual([A, B]);

    const back = toggleSideMenuItem(hidden, resolve(hidden), C);
    expect(back).toEqual({ ids: [C, A, B], hidden: [] });
  });

  it("возвращённый сервис встаёт выше горячих кнопок, а не за ними", () => {
    const start = { ids: [A, "search", "bookmarks"], hidden: [B, C] };
    const back = toggleSideMenuItem(start, resolve(start), B);
    expect(resolve(back)).toEqual([B, A, "search", "bookmarks"]);
  });

  // VED-429: «горячие клавиши всегда добавлялись ниже Сервисов в своей группе».
  it("горячая кнопка встаёт сразу под сервисами и убирается", () => {
    const start = defaultSideMenu(SERVICES);
    const added = toggleSideMenuItem(start, resolve(start), "search");
    expect(resolve(added)).toEqual([A, B, C, "search"]);
    const second = toggleSideMenuItem(added, resolve(added), "bookmarks");
    expect(resolve(second)).toEqual([A, B, C, "bookmarks", "search"]);
    const removed = toggleSideMenuItem(second, resolve(second), "search");
    expect(resolve(removed)).toEqual([A, B, C, "bookmarks"]);
    expect(removed.hidden).toEqual([]);
  });

  it("горячая кнопка — за последним сервисом, даже если его переставили вниз", () => {
    const start = { ids: [A, "search", B, C], hidden: [] };
    const added = toggleSideMenuItem(start, resolve(start), "bookmarks");
    expect(resolve(added)).toEqual([A, "search", B, C, "bookmarks"]);
  });

  it("без видимых сервисов горячая кнопка встаёт первой", () => {
    const start = { ids: ["search"], hidden: [A, B, C] };
    const added = toggleSideMenuItem(start, resolve(start), "bookmarks");
    expect(resolve(added)).toEqual(["bookmarks", "search"]);
  });
});

describe("moveSideMenuItem", () => {
  it("меняет местами сервисы и горячие кнопки в одном списке", () => {
    const start = { ids: [A, B, C, "search"], hidden: [] };
    const up = moveSideMenuItem(start, resolve(start), "search", -1);
    expect(resolve(up)).toEqual([A, B, "search", C]);
    const down = moveSideMenuItem(up, resolve(up), A, 1);
    expect(resolve(down)).toEqual([B, A, "search", C]);
  });

  it("за края списка не выходит и спрятанное не трогает", () => {
    const start = { ids: [A, C], hidden: [B] };
    expect(moveSideMenuItem(start, resolve(start), A, -1)).toEqual(start);
    expect(moveSideMenuItem(start, resolve(start), C, 1)).toEqual(start);
  });
});

describe("sideMenuHotkeys", () => {
  it("предлагает горячие кнопки, кроме сервисов и самого «Меню»", () => {
    const ids = sideMenuHotkeys(
      quickActionCatalog([{ label: "Свой", href: "/music/1" }]),
    ).map((meta) => meta.id);
    expect(ids).toContain("search");
    expect(ids).toContain("history");
    expect(ids).toContain("custom:/music/1");
    expect(ids).not.toContain("menu");
    expect(ids.some((id) => id.startsWith("service:"))).toBe(false);
  });
});
