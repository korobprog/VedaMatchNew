import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicTrackRow } from "./music-track-row";

vi.mock("./player/player-provider", () => ({ useMusicPlayer: () => null }));

const track = {
  id: "t1",
  title: "Maha Mantra",
  durationSeconds: 4360,
  coverUrl: null,
  artist: { id: "a1", slug: "shanti-people", name: "Shanti people" },
} as unknown as MusicTrackDto;

describe("MusicTrackRow", () => {
  it("показывает время записи, а сердца в строке нет (VED-113)", () => {
    render(<MusicTrackRow track={track} position={1} />);

    // Часовая программа — с часами: по времени отличают бхаджан от лекции.
    expect(screen.getByText("1:12:40")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /избранно/i }),
    ).not.toBeInTheDocument();
  });

  it("карточка записи по-прежнему открывается значком", () => {
    render(<MusicTrackRow track={track} />);

    expect(
      screen.getByRole("link", { name: "Карточка записи: Maha Mantra" }),
    ).toHaveAttribute("href", "/music/tracks/t1");
  });
});
