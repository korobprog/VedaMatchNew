import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicQueuePanel } from "./queue-panel";
import { useMusicPlayer } from "./player-provider";

vi.mock("./player-provider", () => ({ useMusicPlayer: vi.fn() }));

function track(id: string, title: string): MusicTrackDto {
  return {
    id,
    title,
    artist: null,
    album: null,
    categories: [],
    durationSeconds: 100,
    coverUrl: null,
    language: null,
    isLiveRecording: false,
    lineage: null,
    playCount: 0,
    publishedAt: null,
  };
}

vi.mock("./use-queue-tracks", () => ({
  useQueueTracks: () => ({
    tracks: {
      a: track("a", "Арати"),
      b: track("b", "Бхаджан"),
      c: track("c", "Ямуна"),
    },
    missing: new Set<string>(),
  }),
}));

function player(over: Record<string, unknown> = {}) {
  return {
    queue: ["a", "b", "c"],
    index: 1,
    play: vi.fn(),
    removeFromQueue: vi.fn(),
    clearQueue: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(useMusicPlayer).mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("MusicQueuePanel", () => {
  it("выделяет играющую запись фиолетовым фоном и рамкой, как строки списков (VED-270)", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player() as never);
    render(<MusicQueuePanel onClose={vi.fn()} />);

    const current = screen.getByRole("button", { name: /^Бхаджан/ });
    const row = current.closest("li");
    expect(row?.className).toContain("bg-violet/10");
    expect(row?.className).toContain("ring-violet/40");
    expect(current).toHaveAttribute("aria-current", "true");

    const other = screen.getByRole("button", { name: /^Арати/ });
    expect(other.closest("li")?.className).not.toContain("bg-violet/10");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("прокручивает к играющей записи при открытии", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player({ index: 2 }) as never);
    render(<MusicQueuePanel onClose={vi.fn()} />);

    const current = screen.getByRole("button", { name: /^Ямуна/ });
    expect(current.closest("li")).not.toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("пустая очередь ничего не подсвечивает и не падает", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player({ queue: [] }) as never);
    render(<MusicQueuePanel onClose={vi.fn()} />);

    expect(screen.getByText("Очередь пуста.")).toBeInTheDocument();
  });
});
