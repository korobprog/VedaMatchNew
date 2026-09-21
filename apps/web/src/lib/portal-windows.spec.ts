import { describe, expect, it } from "vitest";
import {
  createPortalWindows,
  currentPortalUrl,
  nextPortalWindow,
  parsePortalWindows,
  portalWindowButtonHint,
  portalWindowButtonLabel,
  recordPortalNavigation,
  rememberPortalScroll,
  serializePortalWindows,
  switchPortalWindow,
  PORTAL_WINDOW_HOME,
} from "./portal-windows";

describe("createPortalWindows", () => {
  it("заводит два окна, второе пустое", () => {
    const state = createPortalWindows("/music");
    expect(state.windows).toHaveLength(2);
    expect(state.active).toBe(0);
    expect(currentPortalUrl(state)).toBe("/music");
    expect(state.windows[1].at).toBe(-1);
  });

  it("число окон не зашито", () => {
    expect(createPortalWindows("/", 4).windows).toHaveLength(4);
  });
});

describe("recordPortalNavigation", () => {
  it("копит историю активного окна", () => {
    let state = createPortalWindows("/music");
    state = recordPortalNavigation(state, "/music/artists");
    state = recordPortalNavigation(state, "/music/artists/1");
    expect(state.windows[0].entries.map((e) => e.url)).toEqual([
      "/music",
      "/music/artists",
      "/music/artists/1",
    ]);
    expect(state.windows[0].at).toBe(2);
  });

  it("повтор того же адреса ничего не меняет", () => {
    const state = createPortalWindows("/music");
    expect(recordPortalNavigation(state, "/music")).toBe(state);
  });

  it("узнаёт «назад» и двигает указатель, а не плодит запись", () => {
    let state = createPortalWindows("/music");
    state = recordPortalNavigation(state, "/music/artists");
    state = recordPortalNavigation(state, "/music");
    expect(state.windows[0].at).toBe(0);
    expect(state.windows[0].entries).toHaveLength(2);
  });

  it("узнаёт «вперёд» после «назад»", () => {
    let state = createPortalWindows("/music");
    state = recordPortalNavigation(state, "/music/artists");
    state = recordPortalNavigation(state, "/music");
    state = recordPortalNavigation(state, "/music/artists");
    expect(state.windows[0].at).toBe(1);
    expect(state.windows[0].entries).toHaveLength(2);
  });

  it("новый переход из середины обрезает хвост", () => {
    let state = createPortalWindows("/a");
    state = recordPortalNavigation(state, "/b");
    state = recordPortalNavigation(state, "/a");
    state = recordPortalNavigation(state, "/c");
    expect(state.windows[0].entries.map((e) => e.url)).toEqual(["/a", "/c"]);
  });

  it("не растёт дальше предела, срезая с головы", () => {
    let state = createPortalWindows("/0");
    for (let i = 1; i < 10; i += 1) {
      state = recordPortalNavigation(state, `/${i}`, 3);
    }
    expect(state.windows[0].entries.map((e) => e.url)).toEqual([
      "/7",
      "/8",
      "/9",
    ]);
    expect(state.windows[0].at).toBe(2);
  });

  it("пишет только в активное окно", () => {
    let state = createPortalWindows("/music");
    state = switchPortalWindow(state, 1).state;
    state = recordPortalNavigation(state, "/market");
    expect(currentPortalUrl(state)).toBe("/market");
    expect(state.windows[0].entries.map((e) => e.url)).toEqual(["/music"]);
  });
});

describe("switchPortalWindow", () => {
  it("пустое окно начинает с главной", () => {
    const state = createPortalWindows("/music");
    const { state: next, target } = switchPortalWindow(state, 1);
    expect(target.url).toBe(PORTAL_WINDOW_HOME);
    expect(next.active).toBe(1);
  });

  it("возврат приводит в то же место, где окно оставили", () => {
    let state = createPortalWindows("/music");
    state = recordPortalNavigation(state, "/music/artists/1");
    state = switchPortalWindow(state, 1).state;
    state = recordPortalNavigation(state, "/market/cart");

    const back = switchPortalWindow(state, 0);
    expect(back.target.url).toBe("/music/artists/1");
    expect(back.state.active).toBe(0);

    const forward = switchPortalWindow(back.state, 1);
    expect(forward.target.url).toBe("/market/cart");
  });

  it("возвращает и прокрутку", () => {
    let state = createPortalWindows("/music");
    state = rememberPortalScroll(state, 640);
    state = switchPortalWindow(state, 1).state;
    expect(switchPortalWindow(state, 0).target).toEqual({
      url: "/music",
      scroll: 640,
    });
  });

  it("индекс за пределами заворачивается по кругу", () => {
    const state = createPortalWindows("/music");
    expect(switchPortalWindow(state, 2).state.active).toBe(0);
    expect(switchPortalWindow(state, -1).state.active).toBe(1);
  });
});

describe("подпись кнопки", () => {
  it("показывает номер окна, куда перейдёшь", () => {
    const first = createPortalWindows("/music");
    expect(portalWindowButtonLabel(first)).toBe("Окно 2");
    const second = switchPortalWindow(first, 1).state;
    expect(portalWindowButtonLabel(second)).toBe("Окно 1");
  });

  it("при трёх окнах идёт по кругу", () => {
    const state = createPortalWindows("/", 3);
    expect(nextPortalWindow(state, 3)).toBe(1);
    expect(portalWindowButtonLabel(state, 3)).toBe("Окно 2");
    const third = switchPortalWindow(state, 2, 3).state;
    expect(portalWindowButtonLabel(third, 3)).toBe("Окно 1");
  });

  it("подсказка называет и текущее окно", () => {
    expect(portalWindowButtonHint(createPortalWindows("/"))).toBe(
      "Перейти в окно 2. Сейчас открыто окно 1",
    );
  });
});

describe("хранилище", () => {
  it("переживает сериализацию", () => {
    let state = createPortalWindows("/music");
    state = recordPortalNavigation(state, "/music/artists/1");
    state = switchPortalWindow(state, 1).state;
    state = recordPortalNavigation(state, "/work");
    expect(parsePortalWindows(serializePortalWindows(state))).toEqual(state);
  });

  it("пустое и битое хранилище — это «нет состояния»", () => {
    expect(parsePortalWindows(null)).toBeNull();
    expect(parsePortalWindows("{{{")).toBeNull();
    expect(parsePortalWindows('{"active":0}')).toBeNull();
  });

  it("выбрасывает чужие адреса из истории окна", () => {
    const raw = JSON.stringify({
      windows: [
        {
          entries: [
            { url: "https://example.com", scroll: 0 },
            { url: "//example.com", scroll: 0 },
            { url: "/music", scroll: 10 },
          ],
          at: 2,
        },
      ],
      active: 0,
    });
    const state = parsePortalWindows(raw)!;
    expect(state.windows[0].entries).toEqual([{ url: "/music", scroll: 10 }]);
    expect(state.windows[0].at).toBe(0);
  });

  it("добивает недостающие окна до нужного числа", () => {
    const raw = JSON.stringify({
      windows: [{ entries: [{ url: "/music", scroll: 0 }], at: 0 }],
      active: 0,
    });
    expect(parsePortalWindows(raw)!.windows).toHaveLength(2);
  });

  it("активное окно за пределами списка сбрасывается на первое", () => {
    const raw = JSON.stringify({
      windows: [{ entries: [{ url: "/music", scroll: 0 }], at: 0 }],
      active: 9,
    });
    expect(parsePortalWindows(raw)!.active).toBe(0);
  });
});
