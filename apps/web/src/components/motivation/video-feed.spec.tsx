import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MotivationVideoDto } from "@vedamatch/shared";
import { VideoFeed } from "./video-feed";

vi.mock("@/components/quick/quick-panel", () => ({ QuickPanel: () => null }));

const video: MotivationVideoDto = {
  id: "v1",
  url: "https://cdn/v1.mp4",
  title: "Утро",
  category: "vedy",
  categoryTitle: "Веды",
  durationSeconds: 12,
  createdAt: "2026-09-28T00:00:00.000Z",
};

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

describe("VideoFeed", () => {
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    play = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: play,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("вкладка «Видео» в ряду рядом с «Открытками» и текущая", () => {
    mockReducedMotion(false);
    render(
      <VideoFeed
        initial={{ items: [video], nextCursor: null }}
        categories={[]}
      />,
    );
    const tabs = screen.getByRole("navigation", { name: "Вкладки ленты" });
    const labels = [...tabs.querySelectorAll("a")].map(
      (link) => link.textContent,
    );
    expect(labels.indexOf("Видео")).toBe(labels.indexOf("Открытки") + 1);
    expect(screen.getByRole("link", { name: "Видео" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // У «Видео» свои папки — оглавления постов в ряду нет.
    expect(
      screen.queryByRole("link", { name: "Категории" }),
    ).not.toBeInTheDocument();
  });

  it("активный ролик стартует сам без звука", () => {
    mockReducedMotion(false);
    render(
      <VideoFeed
        initial={{ items: [video], nextCursor: null }}
        categories={[]}
      />,
    );
    const element = document.querySelector("video")!;
    expect(element.muted).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it("при prefers-reduced-motion не стартует, касание запускает со звуком", async () => {
    mockReducedMotion(true);
    const user = userEvent.setup();
    render(
      <VideoFeed
        initial={{ items: [video], nextCursor: null }}
        categories={[]}
      />,
    );
    expect(play).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Смотреть «Утро» со звуком" }),
    );
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector("video")!.muted).toBe(false);
  });

  it("строка папок фильтрует ленту по категории", () => {
    mockReducedMotion(false);
    render(
      <VideoFeed
        initial={{ items: [video], nextCursor: null }}
        categories={[
          {
            id: "a",
            slug: "vedy",
            title: "Веды",
            parentId: null,
            videoCount: 1,
          },
        ]}
        category="vedy"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Категории видео" });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Веды");
    expect(current).toHaveAttribute(
      "href",
      "/motivation?tab=video&category=vedy",
    );
  });

  it("пустая папка — понятная заглушка и путь ко всем видео", () => {
    mockReducedMotion(false);
    render(
      <VideoFeed
        initial={{ items: [], nextCursor: null }}
        categories={[]}
        category="pusto"
      />,
    );
    expect(
      screen.getByText("В этой категории видео пока нет"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Все видео" })).toHaveAttribute(
      "href",
      "/motivation?tab=video",
    );
  });
});
