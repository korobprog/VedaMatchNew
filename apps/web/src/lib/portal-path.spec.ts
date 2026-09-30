import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PORTAL_CRUMB_LIMIT,
  PORTAL_PATH_CONTAINERS,
  buildPortalPath,
  humanizeSegment,
  isIdLike,
  pageTitleForCrumb,
  portalBreadcrumbsHidden,
  withoutParentSuffix,
} from "./portal-path";

const labels = (path: string, title: string | null = null) =>
  buildPortalPath(path, { title }).map((crumb) => crumb.label);

describe("buildPortalPath", () => {
  it("на Главной путь пуст", () => {
    expect(buildPortalPath("/")).toEqual([]);
    expect(buildPortalPath("")).toEqual([]);
  });

  it("корень сервиса: Главная › сервис, сервис — текущий шаг", () => {
    expect(buildPortalPath("/market")).toEqual([
      { label: "Главная", href: "/", current: false },
      { label: "Рынок", href: null, current: true },
    ]);
  });

  it("имя сервиса берётся из каталога", () => {
    const crumbs = buildPortalPath("/union/likes", {
      resolve: (slug, fallback) => (slug === "union" ? "Союз" : fallback),
    });
    expect(crumbs.map((c) => c.label)).toEqual(["Главная", "Союз", "Симпатии"]);
    expect(crumbs[1]!.href).toBe("/union");
  });

  it("раздел портала без записи в каталоге назван по-человечески", () => {
    expect(labels("/notifications/history")).toEqual([
      "Главная",
      "Уведомления",
      "История",
    ]);
  });

  it("каждый шаг, кроме текущего, ведёт на свой адрес", () => {
    const crumbs = buildPortalPath("/market/orders/42");
    expect(crumbs).toEqual([
      { label: "Главная", href: "/", current: false },
      { label: "Рынок", href: "/market", current: false },
      { label: "Заказы", href: "/market/orders", current: false },
      { label: "Заказ", href: null, current: true },
    ]);
  });

  it("известная ступень сильнее звёздочки", () => {
    expect(labels("/market/orders")).toEqual(["Главная", "Рынок", "Заказы"]);
    expect(labels("/market/sell/new")).toEqual([
      "Главная",
      "Рынок",
      "Продать",
      "Новый товар",
    ]);
  });

  it("последний динамический шаг берёт заголовок страницы", () => {
    expect(labels("/market/orders/42", "Заказ №42")).toEqual([
      "Главная",
      "Рынок",
      "Заказы",
      "Заказ №42",
    ]);
    expect(labels("/notices/1487", "Продам фисгармонию")).toEqual([
      "Главная",
      "Объявления",
      "Продам фисгармонию",
    ]);
  });

  it("известный раздел заголовком страницы не подменяется", () => {
    expect(labels("/market/orders", "Мои заказы и покупки")).toEqual([
      "Главная",
      "Рынок",
      "Заказы",
    ]);
  });

  it("папка без своей страницы внутри сервиса выпадает из пути", () => {
    const crumbs = buildPortalPath("/market/listing/abc", { title: "Чётки" });
    expect(crumbs.map((c) => c.label)).toEqual(["Главная", "Рынок", "Чётки"]);
    expect(crumbs.map((c) => c.href)).toEqual(["/", "/market", null]);
  });

  it("корень без страницы и динамическая папка — шаги без ссылки", () => {
    expect(buildPortalPath("/legal/privacy").map((c) => c.href)).toEqual([
      "/",
      null,
      null,
    ]);
    const crumbs = buildPortalPath("/travel/manage/s1/cash/stats");
    expect(crumbs.map((c) => c.label)).toEqual([
      "Главная",
      "Путешествия",
      "Управление",
      "Объект",
      "Касса",
      "Статистика",
    ]);
    expect(crumbs.map((c) => c.href)).toEqual([
      "/",
      "/travel",
      "/travel/manage",
      null,
      "/travel/manage/s1/cash",
      null,
    ]);
  });

  it("карта путешествий: папка places выпадает, место — из заголовка", () => {
    expect(labels("/travel/map/places/p1/edit")).toEqual([
      "Главная",
      "Путешествия",
      "Карта",
      "Место",
      "Правка",
    ]);
    expect(labels("/travel/map/new")).toEqual([
      "Главная",
      "Путешествия",
      "Карта",
      "Новое место",
    ]);
    expect(labels("/travel/map/routes/r1/edit")).toEqual([
      "Главная",
      "Путешествия",
      "Карта",
      "Маршруты",
      "Маршрут",
      "Правка",
    ]);
  });

  it("ветка беседы: буквальная папка thread выпадает", () => {
    expect(labels("/chat/c1/thread/m1")).toEqual([
      "Главная",
      "Общение",
      "Беседа",
      "Ветка",
    ]);
  });

  it("в админке второй шаг — имя сервиса", () => {
    expect(labels("/admin/market/reports")).toEqual([
      "Главная",
      "Админка",
      "Рынок",
      "Жалобы",
    ]);
  });

  it("незнакомый слаг очеловечивается, идентификатор сокращается", () => {
    expect(labels("/admin/motivation/some-thing")).toEqual([
      "Главная",
      "Админка",
      "Вдохновение",
      "Some thing",
    ]);
    expect(labels("/admin/music/ingest/clx9a8b7c6d5e4f3g2")).toEqual([
      "Главная",
      "Админка",
      "Музыка",
      "Загрузка",
      "#clx9a8",
    ]);
  });

  it("запрос и якорь в путь не входят, кириллица декодируется", () => {
    expect(labels("/music/playlists?tab=all#x")).toEqual([
      "Главная",
      "Музыка",
      "Плейлисты",
    ]);
    expect(labels("/admin/%D0%BA%D1%80%D1%83%D0%B3")).toEqual([
      "Главная",
      "Админка",
      "Круг",
    ]);
  });

  it("длинная подпись обрезается", () => {
    const long = "а".repeat(80);
    const last = buildPortalPath("/notices/1", { title: long }).at(-1)!;
    expect(last.label).toHaveLength(PORTAL_CRUMB_LIMIT);
    expect(last.label.endsWith("…")).toBe(true);
  });

  it("первый шаг подписывается на языке интерфейса", () => {
    expect(buildPortalPath("/work", { home: "Home" })[0]!.label).toBe("Home");
  });
});

describe("portalBreadcrumbsHidden", () => {
  it("прячет на Главной", () => {
    expect(portalBreadcrumbsHidden("/")).toBe(true);
  });

  it("прячет на рубрике Образования: там свои крошки по дереву", () => {
    expect(portalBreadcrumbsHidden("/library/bhakti")).toBe(true);
    expect(portalBreadcrumbsHidden("/library/bhakti/old")).toBe(true);
  });

  it("остальные страницы Образования путь показывают", () => {
    expect(portalBreadcrumbsHidden("/library")).toBe(false);
    expect(portalBreadcrumbsHidden("/library/add/pro")).toBe(false);
    expect(portalBreadcrumbsHidden("/library/entry/1")).toBe(false);
    expect(portalBreadcrumbsHidden("/library/favorites")).toBe(false);
  });

  it("страницы сервисов путь показывают", () => {
    expect(portalBreadcrumbsHidden("/market/cart")).toBe(false);
  });
});

describe("pageTitleForCrumb", () => {
  it("снимает суффикс шаблона", () => {
    expect(pageTitleForCrumb("Чётки — VedaMatch")).toBe("Чётки");
  });

  it("заголовок по умолчанию — не про страницу", () => {
    expect(pageTitleForCrumb("VedaMatch Portal")).toBeNull();
    expect(pageTitleForCrumb("")).toBeNull();
    expect(pageTitleForCrumb(null)).toBeNull();
  });
});

describe("isIdLike / humanizeSegment", () => {
  it("отличает идентификаторы от слов", () => {
    expect(isIdLike("1487")).toBe(true);
    expect(isIdLike("8f21c0de-1111-2222-3333-444455556666")).toBe(true);
    expect(isIdLike("clx9a8b7c6d5e4f3g2")).toBe(true);
    expect(isIdLike("bhagavad-gita")).toBe(false);
    expect(isIdLike("settings")).toBe(false);
  });

  it("слаг превращает в подпись", () => {
    expect(humanizeSegment("sri-isopanishad")).toBe("Sri isopanishad");
  });
});

/**
 * Сверка списка «папок» с деревом маршрутов: новая папка без page.tsx
 * внутри маршрута стала бы в пути ссылкой в 404.
 */
describe("PORTAL_PATH_CONTAINERS", () => {
  function collectRoutes(dir: string, route: string[], out: Set<string>) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) {
        if (name === "page.tsx") out.add(route.join("/"));
        continue;
      }
      if (name.startsWith("_") || name.startsWith("@") || name === "api") {
        continue;
      }
      // Группа маршрутов `(portal)` в адрес не входит.
      const next = /^\(.*\)$/.test(name)
        ? route
        : [...route, /^\[.*\]$/.test(name) ? "*" : name];
      collectRoutes(full, next, out);
    }
  }

  it("совпадает с адресами без своей страницы", () => {
    const routes = new Set<string>();
    collectRoutes(join(__dirname, "../app"), [], routes);
    const containers = new Set<string>();
    for (const route of routes) {
      const parts = route.split("/").filter(Boolean);
      for (let i = 1; i < parts.length; i += 1) {
        const prefix = parts.slice(0, i).join("/");
        if (!routes.has(prefix)) containers.add(prefix);
      }
    }
    expect([...PORTAL_PATH_CONTAINERS].sort()).toEqual([...containers].sort());
  });
});

/* VED-678: «Доска — Планировщик» не повторяет «Планировщик» из пути. */
describe("withoutParentSuffix", () => {
  it("срезает хвост, который уже есть шагом выше", () => {
    expect(
      withoutParentSuffix("Доска — Планировщик", [
        "Главная",
        "Работа",
        "Планировщик",
      ]),
    ).toBe("Доска");
  });

  it("чужой хвост и заголовок без тире не трогает", () => {
    expect(withoutParentSuffix("Бхагавад-гита — Глава 2", ["Главная"])).toBe(
      "Бхагавад-гита — Глава 2",
    );
    expect(withoutParentSuffix("Доска", ["Планировщик"])).toBe("Доска");
  });
});
