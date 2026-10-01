import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILTIN_QUICK_ACTIONS,
  quickHrefOpensApp,
  APP_LINK_FALLBACK_MS,
  appHrefFor,
  openQuickAppHref,
  DEFAULT_QUICK_ACTIONS,
  isExternalQuickHref,
  PINNED_QUICK_ACTIONS,
  HEADER_ONLY_QUICK_ACTIONS,
  panelQuickActionCatalog,
  addCustomQuickAction,
  arrangeQuickActions,
  customQuickActionId,
  shortQuickLabel,
  lockedQuickActions,
  moveQuickAction,
  parseQuickConfig,
  pinQuickActions,
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
    expect(parseQuickConfig('{"v":10,"ids":["donate","aphorism"]}')).toEqual({
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
      parseQuickConfig('{"v":10,"ids":["donate","horoscope","qr"]}').ids,
    ).toEqual(["donate"]);
  });

  it("пустой набор — это выбор: панель можно опустошить", () => {
    expect(parseQuickConfig('{"v":10,"ids":[]}').ids).toEqual([]);
  });

  it("убирает дубли: две одинаковые кнопки — сбой, а не выбор", () => {
    expect(parseQuickConfig('{"v":10,"ids":["donate","donate"]}').ids).toEqual([
      "donate",
    ]);
  });

  it("сервисную кнопку узнаёт по слагу, а не по каталогу с сервера", () => {
    // Каталог приезжает запросом, а набор разбирается сразу при открытии.
    expect(
      parseQuickConfig('{"v":10,"ids":["service:work","service:выдумка"]}').ids,
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
      // VED-326: «Открытка» приехала ещё позже — она дописывается в конец.
      "postcard",
      // VED-392: а «История» — позже.
      "history",
      // VED-416: «Плеер» — позже.
      "player",
      // VED-448: «Приложение» — позже.
      "app",
      // VED-502, VED-506: «Радио» и «Блог-лента» — позже.
      "radio",
      "blog",
      // VED-562: «Телеграм» — позже всех.
      "telegram",
      "transits",
    ]);
  });

  it("запись второй версии дополняется: своих кнопок тогда не было", () => {
    expect(parseQuickConfig('{"v":2,"ids":["donate"]}')).toEqual({
      ids: [
        "donate",
        "postcard",
        "history",
        "player",
        "app",
        "radio",
        "blog",
        "telegram",
        "transits",
      ],
      custom: [],
    });
  });

  /* VED-326: «Открытку» просили добавить всем, а не только новичкам. Правило
     «выключенная кнопка остаётся выключенной» она не нарушает: выключить её
     до этой версии было нельзя — кнопки не существовало. */
  it("запись третьей версии получает «Открытку», «Историю», «Плеер» и «Приложение» в конец", () => {
    expect(parseQuickConfig('{"v":3,"ids":["donate","aphorism"]}')).toEqual({
      ids: [
        "donate",
        "aphorism",
        "postcard",
        "history",
        "player",
        "app",
        "radio",
        "blog",
        "telegram",
        "transits",
      ],
      custom: [],
    });
  });

  it("«Открытка» не задваивается, если человек её уже включил", () => {
    expect(parseQuickConfig('{"v":3,"ids":["postcard","donate"]}').ids).toEqual(
      [
        "postcard",
        "donate",
        "history",
        "player",
        "app",
        "radio",
        "blog",
        "telegram",
        "transits",
      ],
    );
  });

  /* VED-392: «Сделай горячую клавишу История» — кнопка обязана доехать и до
     тех, у кого панель давно настроена, по правилу «Открытки». */
  it("запись четвёртой версии получает «Историю», «Плеер» и «Приложение» в конец, свои кнопки целы", () => {
    const raw = JSON.stringify({
      v: 4,
      ids: ["donate", "custom:/work"],
      custom: [{ label: "Работа", href: "/work" }],
    });
    expect(parseQuickConfig(raw)).toEqual({
      ids: [
        "donate",
        "custom:/work",
        "history",
        "player",
        "app",
        "radio",
        "blog",
        "telegram",
        "transits",
      ],
      custom: [{ label: "Работа", href: "/work" }],
    });
  });

  /* VED-416: «Добавь в панель горячих клавиш кнопку ПЛЕЕР» — доезжает и до
     настроенных панелей; выключенная в пятой версии «История» при этом
     остаётся выключенной, а свои кнопки и порядок — как были. */
  it("запись пятой версии получает «Плеер» и «Приложение» в конец", () => {
    const raw = JSON.stringify({
      v: 5,
      ids: ["search", "menu", "custom:/work", "aphorism"],
      custom: [{ label: "Работа", href: "/work" }],
    });
    expect(parseQuickConfig(raw)).toEqual({
      ids: [
        "search",
        "menu",
        "custom:/work",
        "aphorism",
        "player",
        "app",
        "radio",
        "blog",
        "telegram",
        "transits",
      ],
      custom: [{ label: "Работа", href: "/work" }],
    });
  });

  /* VED-448: «Добавь горячую клавишу ПРИЛОЖЕНИЕ» — доезжает и до
     настроенных панелей; выключенный в шестой версии «Плеер» остаётся
     выключенным. */
  it("запись шестой версии получает только «Приложение» в конец", () => {
    expect(parseQuickConfig('{"v":6,"ids":["donate"]}').ids).toEqual([
      "donate",
      "app",
      "radio",
      "blog",
      "telegram",
      "transits",
    ]);
  });

  /* VED-502, VED-534, VED-506: «Радио» и «Блог-лента» доезжают и до
     настроенных панелей; выключенное в седьмой версии «Приложение» остаётся
     выключенным. */
  it("запись седьмой версии получает «Радио» и «Блог-ленту» в конец", () => {
    expect(parseQuickConfig('{"v":7,"ids":["donate"]}').ids).toEqual([
      "donate",
      "radio",
      "blog",
      "telegram",
      "transits",
    ]);
  });

  /* VED-562: «Добавь горячую кнопку Телеграм» — доезжает и до настроенных
     панелей; выключенные в восьмой версии «Радио» и «Блог-лента» остаются
     выключенными, свои кнопки целы. */
  it("запись восьмой версии получает «Телеграм» в конец", () => {
    const raw = JSON.stringify({
      v: 8,
      ids: ["donate", "custom:/work", "calendar"],
      custom: [{ label: "Работа", href: "/work" }],
    });
    expect(parseQuickConfig(raw)).toEqual({
      ids: ["donate", "custom:/work", "calendar", "telegram", "transits"],
      custom: [{ label: "Работа", href: "/work" }],
    });
  });

  it("«Телеграм» не задваивается, если он уже стоит в записи восьмой версии", () => {
    expect(parseQuickConfig('{"v":8,"ids":["telegram","donate"]}').ids).toEqual(
      ["telegram", "donate", "transits"],
    );
  });

  it("выключенные в девятой версии кнопки остаются выключенными", () => {
    expect(parseQuickConfig('{"v":10,"ids":["donate"]}').ids).toEqual([
      "donate",
    ]);
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
      v: 10,
      ids: ["custom:https://example.com"],
      custom: [{ label: "Не наше", href: "https://example.com" }],
    });
    expect(parseQuickConfig(raw)).toEqual({ ids: [], custom: [] });
  });

  it("своя кнопка без подписи — сбой хранилища, а не кнопка", () => {
    const raw = JSON.stringify({
      v: 10,
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

  it("закреплённые три стоят первыми в наборе по умолчанию", () => {
    // VED-326, п. 6: заказчик обвёл их на скриншоте и назвал порядок.
    expect(DEFAULT_QUICK_ACTIONS.slice(0, 3)).toEqual([
      "search",
      "donate",
      "invite",
    ]);
    expect(PINNED_QUICK_ACTIONS).toEqual(["search", "donate", "invite"]);
  });

  it("способы перемещаться по порталу из панели по умолчанию не ушли", () => {
    // VED-163: окно, закладки и поиск — не «что держать под рукой».
    // VED-392: история — тоже способ перемещаться.
    for (const id of ["window", "bookmarks", "history", "search"])
      expect(DEFAULT_QUICK_ACTIONS).toContain(id);
  });

  it("«Открытка» ведёт в «Открытки» вперемешку, как «Афоризм» — в ленту", () => {
    // VED-326: «по принципу Афоризма» — тот же случайный порядок, но вторая
    // лента Вдохновения. Вкладка обязана ехать вместе с порядком, иначе
    // человек окажется в «Для вас».
    expect(quickActionMeta("postcard")?.href).toBe(
      "/motivation?tab=cards&order=random",
    );
    expect(quickActionMeta("aphorism")?.href).toBe("/motivation?order=random");
  });

  it("«Телеграм» ведёт в канал VedaMatch и стоит за «Календарём» (VED-562)", () => {
    const meta = quickActionMeta("telegram");
    expect(meta?.label).toBe("Телеграм");
    expect(meta?.href).toBe("https://t.me/vedamatch");
    expect(isExternalQuickHref(meta!.href!)).toBe(true);
    const at = DEFAULT_QUICK_ACTIONS.indexOf("calendar");
    expect(DEFAULT_QUICK_ACTIONS[at + 1]).toBe("telegram");
  });
});

// VED-326, п. 6: три кнопки, которые человек не выключает.
describe("закреплённые кнопки", () => {
  it("у обычного человека закреплены три, у админа — ни одной", () => {
    expect(lockedQuickActions(false)).toEqual(["search", "donate", "invite"]);
    expect(lockedQuickActions(true)).toEqual([]);
  });

  it("недостающие закреплённые добавляются, и всегда первыми", () => {
    expect(pinQuickActions(["info", "donate"], PINNED_QUICK_ACTIONS)).toEqual([
      "search",
      "donate",
      "invite",
      "info",
    ]);
  });

  it("порядок закреплённых не зависит от того, как их переставили", () => {
    expect(
      pinQuickActions(["invite", "info", "donate", "search"], PINNED_QUICK_ACTIONS),
    ).toEqual(["search", "donate", "invite", "info"]);
  });

  it("у админа набор остаётся таким, каким он его оставил", () => {
    expect(pinQuickActions(["info", "donate"], lockedQuickActions(true))).toEqual([
      "info",
      "donate",
    ]);
  });

  it("закреплённую кнопку не вытолкнуть снизу, а обычную не поднять выше них", () => {
    const ids = ["search", "donate", "invite", "info"];
    // Четвёртая кнопка «вверх» — упирается в закреплённые.
    expect(moveQuickAction(ids, "info", -1, 3)).toEqual(ids);
    // Сама закреплённая тоже не двигается: её место занято границей.
    expect(moveQuickAction(ids, "invite", 1, 3)).toEqual(ids);
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

// VED-434: «Меню» — кнопка заголовка панели, а плиткой панели не бывает.
describe("«Меню» живёт только в шапке", () => {
  it("в каталоге для шапки есть, в панели и наборе по умолчанию — нет", () => {
    expect(HEADER_ONLY_QUICK_ACTIONS).toEqual(["menu"]);
    expect(quickActionMeta("menu")?.label).toBe("Меню");
    expect(DEFAULT_QUICK_ACTIONS).not.toContain("menu");
    expect(
      panelQuickActionCatalog(quickActionCatalog()).map((meta) => meta.id),
    ).not.toContain("menu");
  });

  it("из старой записи «Меню» уходит, остальное на месте", () => {
    const stored = parseQuickConfig(
      '{"v":10,"ids":["search","donate","invite","menu","aphorism"]}',
    );
    expect(arrangeQuickActions(stored.ids, PINNED_QUICK_ACTIONS)).toEqual([
      "search",
      "donate",
      "invite",
      "aphorism",
    ]);
  });

  it("у админа без закреплений — тоже без «Меню»", () => {
    expect(
      arrangeQuickActions(["menu", "info"], lockedQuickActions(true)),
    ).toEqual(["info"]);
  });
});

describe("shortQuickLabel (VED-484)", () => {
  it("от заголовка страницы — последняя часть, название раздела", () => {
    expect(shortQuickLabel("Доска — Планировщик")).toBe("Планировщик");
    expect(shortQuickLabel("Доска - Планировщик")).toBe("Планировщик");
    expect(shortQuickLabel("Статья | Библиотека")).toBe("Библиотека");
  });

  it("хвост «VedaMatch» не становится подписью", () => {
    expect(shortQuickLabel("Музыка — VedaMatch")).toBe("Музыка");
  });

  it("простую подпись не трогает", () => {
    expect(shortQuickLabel("Avantika")).toBe("Avantika");
    expect(shortQuickLabel("Shanti people")).toBe("Shanti people");
  });
});

describe("quickHrefOpensApp (VED-562)", () => {
  it("t.me и telegram.me — открывает приложение, без новой вкладки", () => {
    expect(quickHrefOpensApp("https://t.me/vedamatch")).toBe(true);
    expect(quickHrefOpensApp("https://telegram.me/vedamatch")).toBe(true);
  });

  it("остальные внешние ссылки — новой вкладкой", () => {
    expect(quickHrefOpensApp("https://vcalendar.ru/")).toBe(false);
    expect(quickHrefOpensApp("https://t.me.evil.com/x")).toBe(false);
  });
});

/* VED-562: белый экран на месте страницы t.me — открываем приложение сразу. */
describe("openQuickAppHref", () => {
  afterEach(() => vi.useRealTimers());

  it("ссылки Телеграма превращаются в адрес приложения", () => {
    expect(appHrefFor("https://t.me/vedamatch")).toBe(
      "tg://resolve?domain=vedamatch",
    );
    expect(appHrefFor("https://telegram.me/vedamatch/")).toBe(
      "tg://resolve?domain=vedamatch",
    );
    expect(appHrefFor("https://t.me/vedamatch_bot")).toBe(
      "tg://resolve?domain=vedamatch_bot",
    );
    expect(appHrefFor("https://t.me/+AbCd_123")).toBe(
      "tg://joininvite/AbCd_123",
    );
    expect(appHrefFor("https://vcalendar.ru/")).toBeNull();
    // Веб-просмотр канала — не ссылка приложения.
    expect(appHrefFor("https://t.me/s/vedamatch")).toBeNull();
  });

  it("клик уходит в приложение мимо страницы-посредника", () => {
    const navigate = vi.fn();
    const event = { preventDefault: vi.fn() };
    expect(
      openQuickAppHref(event, "https://t.me/vedamatch", navigate),
    ).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("tg://resolve?domain=vedamatch");
  });

  it("приложение не подхватило ссылку — уходим на страницу канала", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    openQuickAppHref(
      { preventDefault: () => {} },
      "https://t.me/vedamatch",
      navigate,
    );
    vi.advanceTimersByTime(APP_LINK_FALLBACK_MS);
    expect(navigate).toHaveBeenLastCalledWith("https://t.me/vedamatch");
  });

  it("приложение открылось — вкладка ушла в фон, откат не срабатывает", () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    openQuickAppHref(
      { preventDefault: () => {} },
      "https://t.me/vedamatch",
      navigate,
    );
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(APP_LINK_FALLBACK_MS);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("tg://resolve?domain=vedamatch");
  });

  it("чужая ссылка остаётся обычной — переход не перехватывается", () => {
    const navigate = vi.fn();
    const event = { preventDefault: vi.fn() };
    expect(
      openQuickAppHref(event, "https://vcalendar.ru/", navigate),
    ).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
