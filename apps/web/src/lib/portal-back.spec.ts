import { describe, expect, it } from "vitest";
import { planPortalHistoryStep } from "./portal-back";
import {
  createPortalWindows,
  recordPortalNavigation,
  switchPortalWindow,
  type PortalWindowsState,
} from "./portal-windows";

/**
 * Сцена из жалобы VED-354: человек походил по первому окну, заглянул во
 * второе, вернулся — и жмёт «назад».
 */
function twoWindows(): PortalWindowsState {
  let state = createPortalWindows("/work");
  state = recordPortalNavigation(state, "/work/boards/1");
  // Ушли во второе окно и погуляли там.
  state = switchPortalWindow(state, 1).state;
  state = recordPortalNavigation(state, "/music");
  state = recordPortalNavigation(state, "/music/artists/7");
  // Вернулись в первое.
  return switchPortalWindow(state, 0).state;
}

describe("planPortalHistoryStep", () => {
  it("направление не угадывается по адресу: устаревшая запись врёт", () => {
    // После исправленного шага назад в истории вкладки остаётся запись с
    // адресом, который в окне лежит ВПЕРЕДИ. Разбирать её как «вперёд»
    // значит уезжать вперёд на нажатие «назад» (VED-354).
    let state = createPortalWindows("/work");
    state = recordPortalNavigation(state, "/work/boards/1");
    state = recordPortalNavigation(state, "/work/boards/2");
    state = recordPortalNavigation(state, "/work/boards/1");
    const plan = planPortalHistoryStep(state, "/work/boards/2", -1);
    expect(plan.kind).toBe("back");
    expect(plan.kind === "back" && plan.navigate).toBe("/work");
  });

  it("«назад» шагает внутри активного окна, а не уводит в соседнее", () => {
    const state = twoWindows();
    // Браузер увёл туда, где стоит второе окно: записи в его истории идут
    // вперемешку с записями первого.
    const plan = planPortalHistoryStep(state, "/music/artists/7");
    expect(plan.kind).toBe("back");
    if (plan.kind !== "back") return;
    expect(plan.target.url).toBe("/work");
    expect(plan.navigate).toBe("/work");
    expect(plan.state.active).toBe(0);
    expect(plan.state.windows[0].at).toBe(0);
    // Второе окно осталось там, где его оставили: главная, с которой оно
    // открылось, и две страницы Музыки.
    expect(plan.state.windows[1].at).toBe(2);
  });

  it("если браузер и так попал куда надо, роутер не трогаем", () => {
    let state = createPortalWindows("/work");
    state = recordPortalNavigation(state, "/work/boards/1");
    const plan = planPortalHistoryStep(state, "/work");
    expect(plan.kind).toBe("back");
    if (plan.kind !== "back") return;
    expect(plan.navigate).toBeNull();
    expect(plan.state.windows[0].at).toBe(0);
  });

  it("возвращает и положение прокрутки той страницы", () => {
    let state = createPortalWindows("/work");
    state = {
      windows: [{ entries: [{ url: "/work", scroll: 4200 }], at: 0 }],
      active: 0,
    };
    state = recordPortalNavigation(state, "/work/boards/1");
    const plan = planPortalHistoryStep(state, "/work");
    expect(plan.kind === "back" && plan.target.scroll).toBe(4200);
  });

  it("шаг вперёд ведёт по истории окна, а не по адресу записи", () => {
    let state = createPortalWindows("/work");
    state = recordPortalNavigation(state, "/work/boards/1");
    state = recordPortalNavigation(state, "/work");
    const plan = planPortalHistoryStep(state, "/work/boards/1", 1);
    expect(plan.kind).toBe("forward");
    if (plan.kind !== "forward") return;
    expect(plan.navigate).toBeNull();
    expect(plan.state.windows[0].at).toBe(1);
  });

  it("в начале истории окна отпускает браузер: «назад» обязан уводить с портала", () => {
    const state = createPortalWindows("/work");
    const plan = planPortalHistoryStep(state, "/что-то-снаружи");
    expect(plan.kind).toBe("leave");
    if (plan.kind !== "leave") return;
    expect(plan.target).toBeNull();
    expect(plan.state).toBe(state);
  });

  it("шаг за начало окна в чужую запись отдаёт управление тому окну", () => {
    let state = twoWindows();
    // Отмотали первое окно в самое начало.
    state = { ...state, windows: withAt(state, 0, 0) };
    const plan = planPortalHistoryStep(state, "/music");
    expect(plan.kind).toBe("leave");
    if (plan.kind !== "leave") return;
    // Врать подписи на кнопке нельзя: человек стоит во втором окне.
    expect(plan.state.active).toBe(1);
    expect(plan.state.windows[1].at).toBe(1);
    expect(plan.target?.url).toBe("/music");
  });

  it("окно, которое ещё не открывали, браузеру не мешает", () => {
    const state: PortalWindowsState = {
      windows: [{ entries: [], at: -1 }],
      active: 0,
    };
    expect(planPortalHistoryStep(state, "/work").kind).toBe("leave");
  });
});

function withAt(state: PortalWindowsState, index: number, at: number) {
  const windows = [...state.windows];
  windows[index] = { entries: windows[index].entries, at };
  return windows;
}
