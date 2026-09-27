import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicRadioStateDto, MusicTrackDto } from "@vedamatch/shared";
import { leaveMusicRadio, musicRadioHeartbeat } from "@/lib/music-radio-client";
import { freshStreamUrl } from "@/lib/music/stream-url-cache";
import { useMusicPlayer } from "../player/player-provider";
import { MUSIC_PLAYER_REVEAL_EVENT } from "../player/player-reveal";
import {
  MusicRadioProvider,
  useMusicRadio,
  type MusicRadioApi,
} from "./radio-provider";

vi.mock("../player/player-provider", () => ({ useMusicPlayer: vi.fn() }));
vi.mock("@/lib/music-radio-client", () => ({
  fetchMusicRadio: vi.fn(),
  musicRadioHeartbeat: vi.fn(),
  leaveMusicRadio: vi.fn(() => Promise.resolve()),
}));

const NOW = Date.parse("2030-01-01T10:00:30.000Z");

const state: MusicRadioStateDto = {
  serverTime: new Date(NOW).toISOString(),
  listeners: 1,
  current: {
    slotId: "s1",
    kind: "track",
    startsAt: "2030-01-01T10:00:00.000Z",
    durationMs: 200_000,
    track: { id: "t1", title: "Трек" } as MusicTrackDto,
    insertTitle: null,
    streamUrl: "https://s3/t1.mp3?sig=radio",
  },
  next: null,
};

interface PlayerMock {
  isPlaying: boolean;
  isLoading: boolean;
  loadError: string | null;
  play: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
}

let player: PlayerMock;
const probe: { radio: MusicRadioApi | null } = { radio: null };
/** Элементы, которым звали `play()`: последний — элемент радио. */
const played: HTMLMediaElement[] = [];
const radio = () => probe.radio!;
const element = () => played[played.length - 1];

function Probe() {
  const api = useMusicRadio();
  useEffect(() => {
    probe.radio = api;
  }, [api]);
  return null;
}

function setPlayer(over: Partial<PlayerMock>, rerender: () => void) {
  player = { ...player, ...over };
  vi.mocked(useMusicPlayer).mockReturnValue(player as never);
  act(rerender);
}

async function startRadio() {
  const view = render(
    <MusicRadioProvider>
      <Probe />
    </MusicRadioProvider>,
  );
  await act(async () => {
    radio().start();
    await Promise.resolve();
  });
  // Элемент радио дождался метаданных и встал на секунду эфира.
  act(() => {
    element().dispatchEvent(new Event("loadedmetadata"));
  });
  const rerender = () =>
    view.rerender(
      <MusicRadioProvider>
        <Probe />
      </MusicRadioProvider>,
    );
  return rerender;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setTimeout", "setInterval"] });
  player = {
    isPlaying: false,
    isLoading: false,
    loadError: null,
    play: vi.fn(),
    toggle: vi.fn(),
  };
  vi.mocked(useMusicPlayer).mockReturnValue(player as never);
  vi.mocked(musicRadioHeartbeat).mockResolvedValue(state);
  vi.mocked(leaveMusicRadio).mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    played.push(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  // Размонтировать, пока `pause()` ещё подменён: jsdom его не умеет.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  probe.radio = null;
  played.length = 0;
});

describe("MusicRadioProvider — переход в плеер (VED-542)", () => {
  it("плеер продолжает с той же секунды, радио молчит лишь когда плеер зазвучал", async () => {
    const rerender = await startRadio();
    expect(radio().active).toBe(true);
    expect(radio().item?.track?.id).toBe("t1");
    expect(element().currentTime).toBe(30);

    const reveal = vi.fn();
    window.addEventListener(MUSIC_PLAYER_REVEAL_EVENT, reveal);
    act(() => radio().handoffToPlayer());

    expect(player.play).toHaveBeenCalledWith("t1", ["t1"], 30);
    // Плееру досталась готовая ссылка эфира — без круга через портал.
    expect(freshStreamUrl("t1", Date.now())).toBe(state.current!.streamUrl);

    // Плеер «играет», но ещё грузится — эфир звучит дальше.
    setPlayer({ isPlaying: true, isLoading: true }, rerender);
    expect(radio().active).toBe(true);
    expect(leaveMusicRadio).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();

    // Звук пошёл — радио уступает, полоса плеера выкатывается.
    setPlayer({ isLoading: false }, rerender);
    expect(radio().active).toBe(false);
    expect(leaveMusicRadio).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    window.removeEventListener(MUSIC_PLAYER_REVEAL_EVENT, reveal);
  });

  it("плеер не смог — радио остаётся", async () => {
    const rerender = await startRadio();
    act(() => radio().handoffToPlayer());
    setPlayer({ isPlaying: true, isLoading: true }, rerender);
    setPlayer(
      { isPlaying: false, isLoading: false, loadError: "Не открывается" },
      rerender,
    );
    expect(radio().active).toBe(true);
    expect(leaveMusicRadio).not.toHaveBeenCalled();
  });

  it("повторное нажатие в переходе не запускает плеер второй раз", async () => {
    await startRadio();
    act(() => radio().handoffToPlayer());
    act(() => radio().handoffToPlayer());
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("вставку в плеер не переносим", async () => {
    vi.mocked(musicRadioHeartbeat).mockResolvedValue({
      ...state,
      current: {
        ...state.current!,
        kind: "insert",
        track: null,
        insertTitle: "Анонс",
      },
    });
    await startRadio();
    act(() => radio().handoffToPlayer());
    expect(player.play).not.toHaveBeenCalled();
  });
});
