import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCROLL_NAV_GUTTER, ScrollNavButtons } from "./scroll-nav-buttons";

/**
 * Компонент читает прокрутку всей страницы (`document.documentElement`), а
 * jsdom ничего не раскладывает: высоты — нули, `scrollTop` не задаётся.
 * Поэтому подставляем их геттерами и двигаем «прокрутку» вручную.
 */
const page = { scrollTop: 0, scrollHeight: 5000, clientHeight: 800 };

function defineMetric(name: keyof typeof page) {
  Object.defineProperty(document.documentElement, name, {
    configurable: true,
    get: () => page[name],
  });
}

let scrollTo: ReturnType<typeof vi.fn>;
let reduceMotion = false;

beforeEach(() => {
  Object.assign(page, { scrollTop: 0, scrollHeight: 5000, clientHeight: 800 });
  defineMetric("scrollTop");
  defineMetric("scrollHeight");
  defineMetric("clientHeight");
  // Кадр — через макрозадачу, как в браузере: синхронный вызов колбэка
  // оставил бы в компоненте номер уже отработавшего кадра.
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  reduceMotion = false;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reduceMotion,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["scrollTop", "scrollHeight", "clientHeight"]) {
    delete (document.documentElement as unknown as Record<string, unknown>)[name];
  }
});

const LABELS = {
  top: "Промотать наверх до конца",
  up: "Промотать на одну десятую вверх",
  down: "Промотать на одну десятую вниз",
  bottom: "Промотать вниз до конца",
};

function scrollPageTo(top: number) {
  page.scrollTop = top;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("ScrollNavButtons", () => {
  it("не показывается, когда страница короче экрана и листать нечего", async () => {
    page.scrollHeight = 700;
    const { container } = render(<ScrollNavButtons />);

    // Дать отработать первому кадру — и убедиться, что ничего не появилось.
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("в самом верху — только «вниз», с подписями для скринридера", async () => {
    render(<ScrollNavButtons />);

    expect(await screen.findByRole("button", { name: LABELS.down })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.bottom })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LABELS.top })).toBeNull();
    expect(screen.queryByRole("button", { name: LABELS.up })).toBeNull();
  });

  it("посередине — все четыре, по порядку сверху вниз", async () => {
    render(<ScrollNavButtons />);
    await screen.findByRole("button", { name: LABELS.down });

    scrollPageTo(2000);

    await waitFor(() =>
      expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
        LABELS.top,
        LABELS.up,
        LABELS.down,
        LABELS.bottom,
      ]),
    );
  });

  it("в самом низу — только «вверх»", async () => {
    render(<ScrollNavButtons />);
    await screen.findByRole("button", { name: LABELS.down });

    scrollPageTo(4200);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: LABELS.down })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: LABELS.bottom })).toBeNull();
    expect(screen.getByRole("button", { name: LABELS.top })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.up })).toBeInTheDocument();
  });

  it("кнопки — настоящие кнопки 44×44 с подсказкой, без подложки у полосы", async () => {
    render(<ScrollNavButtons />);
    const button = await screen.findByRole("button", { name: LABELS.down });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("title", LABELS.down);
    expect(button.className.split(/\s+/)).toContain("size-11");
    // Полоса прозрачная (VED-251): ни фона, ни рамки, видны только стрелки.
    const bar = button.parentElement!;
    expect(bar.className).not.toMatch(/\b(bg-|border|glass|shadow)/);
    expect(button.className).not.toMatch(/(^|\s)(bg-|border|glass|shadow)/);
  });

  it("прокручивает плавно, а при prefers-reduced-motion — сразу", async () => {
    render(<ScrollNavButtons />);

    fireEvent.click(await screen.findByRole("button", { name: LABELS.bottom }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 4200, behavior: "smooth" });

    reduceMotion = true;
    fireEvent.click(screen.getByRole("button", { name: LABELS.down }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 420, behavior: "auto" });
  });

  it("поле под колонку есть только на телефоне", () => {
    // Класс с префиксом `max-sm:` — на `sm` и шире список не сужается.
    expect(SCROLL_NAV_GUTTER).toBe("max-sm:pr-6");
  });

  it("снимает подписки при размонтировании", async () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<ScrollNavButtons />);
    await screen.findByRole("button", { name: LABELS.down });

    unmount();

    const windowEvents = removeWindow.mock.calls.map(([type]) => type);
    expect(windowEvents).toEqual(expect.arrayContaining(["scroll", "resize"]));
    expect(removeDocument.mock.calls.map(([type]) => type)).toContain(
      "visibilitychange",
    );
    removeWindow.mockRestore();
    removeDocument.mockRestore();
  });
});
