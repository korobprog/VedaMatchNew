import { describe, expect, it } from "vitest";
import {
  BUILTIN_QUICK_ACTIONS,
  DEFAULT_QUICK_ACTIONS,
  addCustomQuickAction,
  customQuickActionId,
  moveQuickAction,
  parseQuickConfig,
  quickActionCatalog,
  quickActionMeta,
  removeCustomQuickAction,
  serializeQuickConfig,
  serviceActionSlug,
  serviceQuickActions,
  toggleQuickAction,
  type QuickActionId,
  type QuickConfig,
} from "./quick-actions";

const DEFAULTS: QuickConfig = { ids: [...DEFAULT_QUICK_ACTIONS], custom: [] };

describe("parseQuickConfig", () => {
  it("без сохранённого набора отдаёт набор по умолчанию", () => {
    expect(parseQuickConfig(null)).toEqual(DEFAULTS);
    expect(parseQuickConfig("")).toEqual(DEFAULTS);
  });

  it("возвращает сохранённый порядок как есть", () => {
    expect(parseQuickConfig('{"v":3,"ids":["donate","aphorism"]}')).toEqual({
      ids: ["donate", "aphorism"],
      custom: [],
    });
  });

  it("не падает на мусоре в хранилище", () => {
    expect(parseQuickConfig("не json")).toEqual(DEFAULTS);
    expect(parseQuickConfig('{"a":1}')).toEqual(DEFAULTS);
    expect(parseQuickConfig('{"v":99,"ids":["donate"]}')).toEqual(DEFAULTS);
  });

  it("молча выбрасывает кнопки, которых больше нет", () => {
    // В хранилище лежит набор с прошлой версии портала.
    expect(
      parseQuickConfig('{"v":3,"ids":["donate","transits","qr"]}').ids,
    ).toEqual(["donate"]);
  });

  it("пустой набор — это выбор: панель можно опустошить", () => {
    expect(parseQuickConfig('{"v":3,"ids":[]}').ids).toEqual([]);
  });

  it("убирает дубли: две одинаковые кнопки — сбой, а не выбор", () => {
    expect(parseQuickConfig('{"v":3,"ids":["donate","donate"]}').ids).toEqual([
      "donate",
    ]);
  });

  it("сервисную кнопку узнаёт по слагу, а не по каталогу с сервера", () => {
    // Каталог приезжает запросом, а набор разбирается сразу при открытии.
    expect(
      parseQuickConfig('{"v":3,"ids":["service:work","service:выдумка"]}').ids,
    ).toEqual(["service:work"]);
  });

  // VED-163: три кнопки приехали позже панели.
  it("старую запись дополняет новыми кнопками, ставя их первыми", () => {
    expect(parseQuickConfig('["donate","aphorism"]').ids).toEqual([
      "window",
      "bookmarks",
      "search",
      "donate",
      "aphorism",
    ]);
  });

  it("запись второй версии принимает как есть: своих кнопок тогда не было", () => {
    expect(parseQuickConfig('{"v":2,"ids":["donate"]}')).toEqual({
      ids: ["donate"],
      custom: [],
    });
  });

  it("переживает круг через сохранение", () => {
    const config: QuickConfig = {
      ids: ["info", "calculator", customQuickActionId("/work/boards/1")],
      custom: [{ label: "Планировщик", href: "/work/boards/1" }],
    };
    expect(parseQuickConfig(serializeQuickConfig(config))).toEqual(config);
  });

  it("своя кнопка на чужой сайт в панель не попадает", () => {
    const raw = JSON.stringify({
      v: 3,
      ids: ["custom:https://example.com"],
      custom: [{ label: "Не наше", href: "https://example.com" }],
    });
    expect(parseQuickConfig(raw)).toEqual({ ids: [], custom: [] });
  });

  it("своя кнопка без подписи — сбой хранилища, а не кнопка", () => {
    const raw = JSON.stringify({
      v: 3,
      ids: ["custom:/work"],
      custom: [{ label: "  ", href: "/work" }],
    });
    expect(parseQuickConfig(raw).custom).toEqual([]);
  });
});

describe("toggleQuickAction", () => {
  it("включённая кнопка встаёт в конец — туда, куда её и кладут", () => {
    expect(toggleQuickAction(["donate"], "info")).toEqual(["donate", "info"]);
  });

  it("выключает, не трогая остальные", () => {
    expect(toggleQuickAction(["donate", "info", "support"], "info")).toEqual([
      "donate",
      "support",
    ]);
  });

  it("не меняет исходный список", () => {
    const ids: QuickActionId[] = ["donate"];
    toggleQuickAction(ids, "info");
    expect(ids).toEqual(["donate"]);
  });
});

describe("moveQuickAction", () => {
  it("двигает кнопку на шаг", () => {
    expect(moveQuickAction(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveQuickAction(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("на краях ничего не ломает", () => {
    expect(moveQuickAction(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveQuickAction(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });

  it("незнакомую кнопку не двигает", () => {
    expect(moveQuickAction(["a"], "b", 1)).toEqual(["a"]);
  });
});

// VED-345: кнопка из закладки.
describe("свои кнопки", () => {
  const empty: QuickConfig = { ids: [], custom: [] };

  it("заведённая кнопка сразу встаёт в панель", () => {
    const next = addCustomQuickAction(empty, {
      label: "Планировщик",
      href: "/work/boards/1",
    });
    expect(next.ids).toEqual(["custom:/work/boards/1"]);
    expect(next.custom).toEqual([
      { label: "Планировщик", href: "/work/boards/1" },
    ]);
  });

  it("та же страница дважды не двоится, но подпись обновляет", () => {
    const once = addCustomQuickAction(empty, {
      label: "Доска",
      href: "/work/boards/1",
    });
    const twice = addCustomQuickAction(once, {
      label: "Планировщик",
      href: "/work/boards/1",
    });
    expect(twice.ids).toHaveLength(1);
    expect(twice.custom).toEqual([
      { label: "Планировщик", href: "/work/boards/1" },
    ]);
  });

  it("удаление убирает кнопку совсем, а не выключает", () => {
    const config = addCustomQuickAction(empty, {
      label: "Доска",
      href: "/work/boards/1",
    });
    expect(
      removeCustomQuickAction(config, customQuickActionId("/work/boards/1")),
    ).toEqual(empty);
  });

  it("встроенную кнопку удалить нельзя — её можно только выключить", () => {
    const config: QuickConfig = { ids: ["donate"], custom: [] };
    expect(removeCustomQuickAction(config, "donate")).toBe(config);
  });

  it("подпись обрезается: на плитке всё равно две строки", () => {
    const config = addCustomQuickAction(empty, {
      label: "О".repeat(120),
      href: "/work",
    });
    expect(config.custom[0].label).toHaveLength(40);
  });
});

// VED-326: все сервисы доступны в выборе.
describe("сервисные кнопки", () => {
  it("собираются из списка сервисов портала", () => {
    const actions = serviceQuickActions();
    expect(actions.length).toBeGreaterThan(5);
    const work = actions.find((action) => action.id === "service:work");
    expect(work?.href).toBe("/work");
    expect(work?.kind).toBe("service");
  });

  it("выключенный сервис в выбор не попадает", () => {
    const actions = serviceQuickActions({ available: new Set(["work"]) });
    expect(actions.map((action) => action.id)).toEqual(["service:work"]);
  });

  it("каталога нет — показываем все: пустой выбор выглядит поломкой", () => {
    expect(serviceQuickActions({ available: new Set() }).length).toBe(
      serviceQuickActions().length,
    );
  });

  it("имя берётся из каталога сервисов", () => {
    const actions = serviceQuickActions({
      name: (slug, fallback) => (slug === "work" ? "Служение" : fallback),
    });
    expect(
      actions.find((action) => action.id === "service:work")?.label,
    ).toBe("Служение");
  });

  it("слаг вынимается обратно — по нему рисуется значок сервиса", () => {
    expect(serviceActionSlug("service:music")).toBe("music");
    expect(serviceActionSlug("donate")).toBeNull();
  });
});

describe("каталог кнопок", () => {
  it("у каждой кнопки есть подпись и объяснение", () => {
    for (const action of quickActionCatalog(
      [{ label: "Доска", href: "/work/boards/1" }],
      serviceQuickActions(),
    )) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.hint.length).toBeGreaterThan(0);
    }
  });

  it("набор по умолчанию состоит из существующих кнопок", () => {
    for (const id of DEFAULT_QUICK_ACTIONS)
      expect(quickActionMeta(id)).not.toBeNull();
  });

  it("кнопки, которой больше нет, — не исключение, а `null`", () => {
    // Сервис выключили, страницу закладки удалили: панель обязана пережить.
    expect(quickActionMeta("service:выдумка")).toBeNull();
  });

  it("три кнопки перемещения по порталу стоят в панели по умолчанию", () => {
    // VED-163: окно, закладки и поиск — не «что держать под рукой».
    expect(DEFAULT_QUICK_ACTIONS.slice(0, 3)).toEqual([
      "window",
      "bookmarks",
      "search",
    ]);
  });

  it("идентификаторы не повторяются", () => {
    const catalog = quickActionCatalog([], serviceQuickActions());
    expect(new Set(catalog.map((action) => action.id)).size).toBe(
      catalog.length,
    );
  });

  it("значок панели не повторяется на плитке (VED-326)", () => {
    // «Категории» с теми же искрами читались как «то же самое ещё раз».
    const collections = BUILTIN_QUICK_ACTIONS.find(
      (action) => action.id === "collections",
    );
    expect(collections?.label).toBe("Картинки");
  });
});
