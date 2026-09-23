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
  it("прячет сервис и возвращает его в конец", () => {
    const start = defaultSideMenu(SERVICES);
    const hidden = toggleSideMenuItem(start, resolve(start), B);
    expect(hidden).toEqual({ ids: [A, C], hidden: [B] });
    expect(resolve(hidden)).toEqual([A, C]);

    const back = toggleSideMenuItem(hidden, resolve(hidden), B);
    expect(back).toEqual({ ids: [A, C, B], hidden: [] });
  });

  it("добавляет горячую кнопку в конец и убирает её", () => {
    const start = defaultSideMenu(SERVICES);
    const added = toggleSideMenuItem(start, resolve(start), "search");
    expect(resolve(added)).toEqual([A, B, C, "search"]);
    const removed = toggleSideMenuItem(added, resolve(added), "search");
    expect(resolve(removed)).toEqual([A, B, C]);
    expect(removed.hidden).toEqual([]);
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
