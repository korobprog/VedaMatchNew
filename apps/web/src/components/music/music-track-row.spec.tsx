import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { MusicTrackRow } from "./music-track-row";

const player = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("./player/player-provider", () => ({ useMusicPlayer: () => player.value }));

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

  // VED-141: играющую строку в длинном списке искали глазами.
  describe("текущая запись", () => {
    afterEach(() => {
      player.value = null;
    });

    it("выделяет строку и название цветом", () => {
      player.value = { current: { id: "t1" }, isPlaying: true, isLoading: false, queue: [] };
      render(<MusicTrackRow track={track} position={1} />);

      const row = screen.getByRole("button", { name: /Maha Mantra/ });
      expect(row).toHaveAttribute("aria-current", "true");
      expect(row).toHaveAttribute("data-current");
      expect(row).toHaveClass("bg-violet/10", "ring-violet/40");
      // Название красится от признака строки: сама строка серверная.
      expect(screen.getByText("Maha Mantra").closest(".in-data-current\\:text-violet")).not.toBeNull();
    });

    it("остальные строки не выделяет", () => {
      player.value = { current: { id: "other" }, isPlaying: true, isLoading: false, queue: [] };
      render(<MusicTrackRow track={track} position={1} />);

      const row = screen.getByRole("button", { name: /Maha Mantra/ });
      expect(row).not.toHaveAttribute("aria-current");
      expect(row).not.toHaveAttribute("data-current");
      expect(row).not.toHaveClass("bg-violet/10");
    });
  });
});
