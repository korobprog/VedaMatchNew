import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiniPlayer } from "./mini-player";
import type { MusicPlayerApi } from "./player-provider";
import { DEFAULT_PLAYER_PREFS } from "./player-prefs";
import { PLAYER_VIEW_KEY } from "./player-view";
import {
  LONG_PRESS_MS,
  PLAYER_POSITION_KEY,
  parsePlayerPositions,
} from "./player-drag";

const player = {
  current: {
    id: "t1",
    title: "Шри Гуру-вандана",
    coverUrl: null,
    artist: { name: "Исполнитель" },
    durationSeconds: 300,
  },
  queue: ["t1"],
  index: 0,
  isPlaying: true,
  isLoading: false,
  loadError: null,
  positionSeconds: 10,
  durationSeconds: 300,
  playMode: "folder",
  shuffle: false,
  rate: 1,
  volume: 1,
  muted: false,
  isPrivateSession: false,
  isFavorite: false,
  hasNext: false,
  hasPrev: false,
  toggle: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  skip: vi.fn(),
  seek: vi.fn(),
  close: vi.fn(),
  prefs: DEFAULT_PLAYER_PREFS,
  setPrefs: vi.fn(async () => true),
  sleepTimer: { mode: "off" },
  isMusicEditor: false,
} as unknown as MusicPlayerApi;

vi.mock("next/navigation", () => ({
  usePathname: () => "/music",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./player-provider", () => ({ useMusicPlayer: () => player }));
vi.mock("../radio/radio-provider", () => ({ useMusicRadio: () => null }));
vi.mock("./use-track-lyrics", () => ({
  useTrackLyrics: () => ({ lyrics: null, loading: false }),
  hasVisibleLyrics: () => false,
}));
vi.mock("./use-track-bookmarks", () => ({
  useTrackBookmarks: () => ({
    items: [],
    load: () => {},
    add: async () => null,
  }),
}));

/**
 * В jsdom нет раскладки: полосе задаём место руками — во всю ширину окна
 * 1024×768, у нижнего края, высотой 64; пузырю — кружок 56 у левого края.
 */
function mockLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const box =
        this.tagName === "SECTION"
          ? { left: 0, top: 704, right: 1024, bottom: 768 }
          : this.classList.contains("player-bubble")
            ? { left: 12, top: 616, right: 68, bottom: 672 }
            : { left: 0, top: 0, right: 0, bottom: 0 };
      return {
        ...box,
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
        toJSON: () => box,
      } as DOMRect;
    },
  );
}

function savedBar() {
  return parsePlayerPositions(window.localStorage.getItem(PLAYER_POSITION_KEY))
    .bar;
}

function bar(): HTMLElement {
  return screen.getByRole("region", { name: /^Плеер/ });
}

/** Долгое нажатие на свободное место полосы и перенос на `dy`. */
function drag(target: HTMLElement, dy: number) {
  fireEvent.pointerDown(target, {
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 500,
    clientY: 740,
  });
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });
  fireEvent.pointerMove(target, {
    pointerId: 1,
    clientX: 500,
    clientY: 740 + dy,
  });
  fireEvent.pointerUp(target, {
    pointerId: 1,
    clientX: 500,
    clientY: 740 + dy,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockLayout();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MiniPlayer — свёрнутая полоса (VED-454)", () => {
  beforeEach(() => window.localStorage.setItem(PLAYER_VIEW_KEY, "1"));

  it("на месте стрелки вверх — «в пузырь», разворачивает название", () => {
    render(<MiniPlayer />);

    expect(
      screen.queryByRole("button", { name: "Развернуть плеер" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Развернуть плеер: Шри Гуру-вандана",
      }),
    );
    expect(screen.getByRole("region", { name: "Плеер" })).toBeInTheDocument();
    expect(window.localStorage.getItem(PLAYER_VIEW_KEY)).toBe("0");
  });

  it("«в пузырь» убирает полосу в плавающую кнопку", () => {
    render(<MiniPlayer />);

    fireEvent.click(
      screen.getByRole("button", { name: "Свернуть плеер в плавающую кнопку" }),
    );

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Развернуть плеер: Шри Гуру-вандана, играет",
      }),
    ).toHaveFocus();
    expect(window.localStorage.getItem(PLAYER_VIEW_KEY)).toBe("bubble");
  });

  it("остальные действия на месте: пуск, соседние записи, подъём, закрытие", () => {
    render(<MiniPlayer />);
    for (const name of [
      "Пауза",
      "Перемотка назад удержанием",
      "Перемотка вперёд удержанием",
      "Поднять плеер над нижними кнопками",
      "Закрыть плеер",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: "Открыть запись: Шри Гуру-вандана" }),
    ).toBeInTheDocument();
  });
});

describe("MiniPlayer — перенос долгим нажатием (VED-454)", () => {
  beforeEach(() => vi.useFakeTimers());

  it("откреплённая полоса запоминает место и не берёт места внизу", () => {
    const { container } = render(<MiniPlayer />);

    drag(bar(), -300);

    expect(savedBar()).toEqual({ x: 0, y: -300 });
    expect(bar().style.translate).toBe("0px -300px");
    const wrap = container.querySelector("[data-music-player]") as HTMLElement;
    expect(wrap.dataset.detached).toBe("true");
    expect(
      document.documentElement.style.getPropertyValue("--vm-player-measured"),
    ).toBe("0px");
  });

  it("палец поехал раньше срока — это прокрутка, полоса на месте", () => {
    render(<MiniPlayer />);
    const target = bar();

    fireEvent.pointerDown(target, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 500,
      clientY: 740,
    });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 500, clientY: 720 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 500, clientY: 600 });

    expect(savedBar()).toBeNull();
    expect(target.style.translate).toBe("");
  });

  it("долгое нажатие на кнопку полосу не хватает", () => {
    render(<MiniPlayer />);

    drag(screen.getAllByRole("button", { name: "Настройки плеера" })[0], -300);

    expect(savedBar()).toBeNull();
  });

  it("двойное нажатие возвращает откреплённую полосу вниз", () => {
    window.localStorage.setItem(
      PLAYER_POSITION_KEY,
      '{"bar":{"x":0,"y":-300},"bubble":null}',
    );
    render(<MiniPlayer />);
    const target = bar();
    expect(target.style.translate).toBe("0px -300px");

    for (const at of [0, 1]) {
      fireEvent.pointerDown(target, {
        button: 0,
        isPrimary: true,
        pointerId: 2 + at,
        clientX: 500,
        clientY: 440,
      });
      fireEvent.pointerUp(target, {
        pointerId: 2 + at,
        clientX: 500,
        clientY: 440,
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    expect(savedBar()).toBeNull();
    expect(target.style.translate).toBe("");
  });

  it("пузырь тоже переносится, и отпускание его не разворачивает", () => {
    window.localStorage.setItem(PLAYER_VIEW_KEY, "bubble");
    render(<MiniPlayer />);
    const bubble = screen.getByRole("button", { name: /^Развернуть плеер:/ });

    fireEvent.pointerDown(bubble, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 40,
      clientY: 700,
    });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.pointerMove(bubble, { pointerId: 1, clientX: 40, clientY: 500 });
    fireEvent.pointerUp(bubble, { pointerId: 1, clientX: 40, clientY: 500 });
    fireEvent.click(bubble);

    expect(
      parsePlayerPositions(window.localStorage.getItem(PLAYER_POSITION_KEY))
        .bubble,
    ).toEqual({ x: 0, y: -200 });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("MiniPlayer — кнопочная замена переноса (WCAG 2.5.7)", () => {
  it("«Выше», «Ниже» и «Вернуть вниз» в настройках плеера", () => {
    render(<MiniPlayer />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Настройки плеера" })[0],
    );

    expect(
      screen.queryByRole("button", { name: "Вернуть плеер к нижнему краю" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Поднять плеер выше" }));
    fireEvent.click(screen.getByRole("button", { name: "Поднять плеер выше" }));
    expect(savedBar()).toEqual({ x: 0, y: -96 });
    expect(screen.getByText("Плеер выше")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Опустить плеер ниже" }),
    );
    expect(savedBar()).toEqual({ x: 0, y: -48 });

    fireEvent.click(
      screen.getByRole("button", { name: "Вернуть плеер к нижнему краю" }),
    );
    expect(savedBar()).toBeNull();
    expect(
      screen.getByText("Плеер возвращён к нижнему краю"),
    ).toBeInTheDocument();
  });
});
