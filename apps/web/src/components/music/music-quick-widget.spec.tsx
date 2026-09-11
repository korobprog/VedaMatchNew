import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicQuickAccessData } from "@/lib/music-quick-access";
import { MusicQuickWidget } from "./music-quick-widget";
import { useMusicPlayer } from "./player/player-provider";

vi.mock("./player/player-provider", () => ({ useMusicPlayer: vi.fn() }));
vi.mock("./player/use-queue-tracks", () => ({
  useQueueTracks: () => ({ tracks: [], missing: 0 }),
}));
vi.mock("@/lib/music-playback-api", () => ({
  getListenStats: () => Promise.resolve(null),
}));

const data: MusicQuickAccessData = {
  favoritesCount: 0,
  resume: {
    trackId: "b",
    title: "Jugala Milane",
    artistName: "Jahnavi Dasi",
    coverUrl: null,
    positionSeconds: 40,
    percent: 20,
    remainingLabel: "осталось 3:00",
    queue: ["a", "b", "c"],
  },
};

function player(over: Record<string, unknown> = {}) {
  return {
    current: null,
    isPlaying: false,
    hasPrev: false,
    hasNext: false,
    positionSeconds: 0,
    durationSeconds: 0,
    play: vi.fn(),
    toggle: vi.fn(),
    prev: vi.fn(),
    next: vi.fn(),
    seek: vi.fn(),
    ...over,
  };
}

/** Кнопки есть в двух раскладках — телефонной и широкой; берём первую. */
const button = (name: string) => screen.getAllByRole("button", { name })[0];

beforeEach(() => vi.mocked(useMusicPlayer).mockReset());

describe("MusicQuickWidget — назад и вперёд (VED-88)", () => {
  // Полосу плеера закрыли — запись не поднята. Раньше кнопки были бледными
  // и молчали: очередь с сервера приходила из одной записи.
  it("plays the neighbour from the saved queue before the player is up", async () => {
    const p = player();
    vi.mocked(useMusicPlayer).mockReturnValue(p as never);
    const user = userEvent.setup();
    render(<MusicQuickWidget data={data} />);

    await user.click(button("Следующая запись"));
    expect(p.play).toHaveBeenCalledWith("c", ["a", "b", "c"], 0);

    await user.click(button("Предыдущая запись"));
    expect(p.play).toHaveBeenLastCalledWith("a", ["a", "b", "c"], 0);
  });

  it("dims a button with no neighbour in the saved queue", () => {
    vi.mocked(useMusicPlayer).mockReturnValue(player() as never);
    render(
      <MusicQuickWidget
        data={{ ...data, resume: { ...data.resume!, trackId: "c" } }}
      />,
    );

    expect(button("Следующая запись")).toBeDisabled();
    expect(button("Предыдущая запись")).toBeEnabled();
  });

  it("uses the player's own queue once a record is playing", async () => {
    const p = player({
      current: {
        id: "b",
        title: "Jugala Milane",
        coverUrl: null,
        artist: null,
        album: null,
        durationSeconds: 200,
      },
      hasNext: true,
    });
    vi.mocked(useMusicPlayer).mockReturnValue(p as never);
    const user = userEvent.setup();
    render(<MusicQuickWidget data={data} />);

    await user.click(button("Следующая запись"));
    expect(p.next).toHaveBeenCalledTimes(1);
    expect(p.play).not.toHaveBeenCalled();
    expect(button("Предыдущая запись")).toBeDisabled();
  });
});
