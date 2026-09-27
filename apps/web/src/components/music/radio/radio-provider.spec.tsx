import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MusicRadioItemDto,
  MusicRadioStateDto,
  MusicTrackDto,
} from "@vedamatch/shared";
import {
  fetchMusicArtistTracks,
  fetchMusicRadio,
  leaveMusicRadio,
  musicRadioHeartbeat,
} from "@/lib/music-radio-client";
import { freshStreamUrl } from "@/lib/music/stream-url-cache";
import { mediaSessionHeldByRadio } from "../player/media-session";
import { useMusicPlayer } from "../player/player-provider";
import { MUSIC_PLAYER_REVEAL_EVENT } from "../player/player-reveal";
import {
  MusicRadioProvider,
  useMusicRadio,
  type MusicRadioApi,
} from "./radio-provider";

vi.mock("../player/player-provider", () => ({ useMusicPlayer: vi.fn() }));
vi.mock("@/lib/music-radio-client", () => ({
  fetchMusicArtistTracks: vi.fn(),
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
  adoptQueue: ReturnType<typeof vi.fn>;
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
    adoptQueue: vi.fn(),
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
    // Карточка на экране блокировки — всё ещё радио (VED-543): плеер её
    // не трогает, пока эфир звучит.
    expect(mediaSessionHeldByRadio()).toBe(true);

    // Звук пошёл — радио уступает, полоса плеера выкатывается.
    setPlayer({ isLoading: false }, rerender);
    expect(radio().active).toBe(false);
    expect(leaveMusicRadio).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    // Радио замолкло — карточка отдана плееру.
    expect(mediaSessionHeldByRadio()).toBe(false);
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

  it("очередь плеера — папка исполнителя записи (VED-585)", async () => {
    vi.mocked(musicRadioHeartbeat).mockResolvedValue({
      ...state,
      current: {
        ...state.current!,
        track: {
          id: "t1",
          title: "Бхаджан",
          artist: { id: "a1", slug: "uma", name: "Uma" },
        } as MusicTrackDto,
      },
    });
    vi.mocked(fetchMusicArtistTracks).mockResolvedValue([
      { id: "t2", title: "Вишну" } as MusicTrackDto,
      { id: "t1", title: "Бхаджан" } as MusicTrackDto,
      { id: "t0", title: "Ахам" } as MusicTrackDto,
    ]);
    await startRadio();
    await act(async () => {
      radio().handoffToPlayer();
      await Promise.resolve();
    });
    // Звук не ждёт папку: запись стартует сразу одна…
    expect(player.play).toHaveBeenCalledWith("t1", ["t1"], 30);
    // …а очередь подменяется вокруг неё, когда папка пришла.
    expect(fetchMusicArtistTracks).toHaveBeenCalledWith("uma");
    expect(player.adoptQueue).toHaveBeenCalledWith("t1", ["t0", "t1", "t2"]);
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

/** `<audio>` без звука: jsdom не играет медиа, а нам нужны события. */
class FakeAudio extends EventTarget {
  static last: FakeAudio | null = null;
  src = "";
  preload = "";
  loop = false;
  currentTime = 0;
  ended = false;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn(() => undefined);
  load = vi.fn(() => undefined);
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") this.src = "";
  });
  constructor() {
    super();
    FakeAudio.last = this;
  }
}

const slot = (
  slotId: string,
  startsAt: string,
  durationMs: number,
): MusicRadioItemDto => ({
  slotId,
  kind: "track",
  startsAt,
  durationMs,
  track: null,
  insertTitle: null,
  streamUrl: `https://cdn.example.org/${slotId}.mp3`,
});

const A = slot("a", "2030-01-01T10:00:00.000Z", 60_000);
const B = slot("b", "2030-01-01T10:01:00.000Z", 60_000);
const C = slot("c", "2030-01-01T10:02:00.000Z", 60_000);

const airState = (
  current: MusicRadioItemDto | null,
  next: MusicRadioItemDto | null,
): MusicRadioStateDto => ({
  serverTime: new Date(Date.now()).toISOString(),
  current,
  next,
  listeners: 3,
});

const session = {
  metadata: null as unknown,
  playbackState: "none" as MediaSessionPlaybackState,
  handlers: new Map<string, MediaSessionActionHandler | null>(),
  setActionHandler: vi.fn(
    (action: string, handler: MediaSessionActionHandler | null) => {
      session.handlers.set(action, handler);
    },
  ),
  setPositionState: vi.fn(),
};

class FakeMediaMetadata {
  constructor(public init: MediaMetadataInit) {}
}

let api: MusicRadioApi | null = null;
function ApiProbe() {
  const radio = useMusicRadio();
  useEffect(() => {
    api = radio;
  });
  return null;
}

/** Дождаться промисов запроса и `play()` — без продвижения таймеров. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function startAirRadio() {
  render(
    <MusicRadioProvider>
      <ApiProbe />
    </MusicRadioProvider>,
  );
  act(() => api!.start());
  await flush();
  const element = FakeAudio.last!;
  expect(element).not.toBeNull();
  return element;
}

describe("MusicRadioProvider — эфир при погашенном экране (VED-543)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    vi.setSystemTime(new Date("2030-01-01T10:00:30.000Z"));
    FakeAudio.last = null;
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("MediaMetadata", FakeMediaMetadata);
    session.metadata = null;
    session.playbackState = "none";
    session.handlers.clear();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: session,
    });
    vi.mocked(leaveMusicRadio).mockResolvedValue({ ok: true });
    vi.mocked(fetchMusicRadio).mockImplementation(async () => airState(A, B));
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(A, B),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // @ts-expect-error — убираем заглушку, которой в jsdom нет.
    delete navigator.mediaSession;
    api = null;
  });

  it("входит в эфир с нужной секунды", async () => {
    const element = await startAirRadio();
    expect(element.src).toBe(A.streamUrl);
    expect(element.loop).toBe(false);
    element.dispatchEvent(new Event("loadedmetadata"));
    expect(element.currentTime).toBe(30);
    expect(api!.item?.slotId).toBe("a");
  });

  it("следующая запись — по ended того же <audio>, без таймеров", async () => {
    const element = await startAirRadio();
    const plays = element.play.mock.calls.length;
    const fetches = vi.mocked(musicRadioHeartbeat).mock.calls.length;
    // Кроме отметки «слушаю» никаких таймеров: переход их не ждёт.
    expect(vi.getTimerCount()).toBe(1);

    vi.setSystemTime(new Date("2030-01-01T10:01:00.200Z"));
    act(() => {
      // Конец файла: браузер сперва шлёт pause, уже с ended = true.
      element.ended = true;
      element.dispatchEvent(new Event("pause"));
      element.dispatchEvent(new Event("ended"));
    });

    // Ссылка взята из прошлого ответа, play() — в том же обработчике.
    expect(element.src).toBe(B.streamUrl);
    expect(element.play.mock.calls.length).toBe(plays + 1);
    expect(api!.item?.slotId).toBe("b");
    expect(api!.paused).toBe(false);
    // Эфир спрошен заодно — узнать, что после «b».
    expect(vi.mocked(musicRadioHeartbeat).mock.calls.length).toBe(fetches + 1);
  });

  it("слот укоротила вставка — обрыв по timeupdate, а не по таймеру", async () => {
    const element = await startAirRadio();
    act(() => {
      element.currentTime = 60.1;
      element.dispatchEvent(new Event("timeupdate"));
    });
    expect(element.src).toBe(B.streamUrl);
  });

  it("у конца записи без следующей ссылки — эфир спрашивается заранее", async () => {
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(A, null),
    );
    const element = await startAirRadio();
    const fetches = vi.mocked(musicRadioHeartbeat).mock.calls.length;
    vi.setSystemTime(new Date("2030-01-01T10:00:45.000Z"));
    act(() => {
      element.currentTime = 45;
      element.dispatchEvent(new Event("timeupdate"));
    });
    expect(vi.mocked(musicRadioHeartbeat).mock.calls.length).toBe(fetches + 1);
  });

  it("ссылки на следующую нет — крутит тишину и ставит запись по ответу", async () => {
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(A, null),
    );
    const element = await startAirRadio();
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(B, C),
    );
    vi.setSystemTime(new Date("2030-01-01T10:01:00.100Z"));
    act(() => {
      element.ended = true;
      element.dispatchEvent(new Event("ended"));
    });
    expect(element.loop).toBe(true);
    expect(element.src.startsWith("data:audio/wav")).toBe(true);
    element.ended = false;
    await flush();
    expect(element.src).toBe(B.streamUrl);
    expect(element.loop).toBe(false);
  });

  it("Media Session: карточка эфира и свои кнопки", async () => {
    const element = await startAirRadio();
    const meta = session.metadata as FakeMediaMetadata;
    expect(meta).toBeInstanceOf(FakeMediaMetadata);
    expect(meta.init.album).toBe("Радио VM");
    expect(session.handlers.get("play")).toBeTypeOf("function");
    expect(session.handlers.get("pause")).toBeTypeOf("function");
    expect(session.handlers.get("stop")).toBeTypeOf("function");
    expect(session.handlers.get("nexttrack")).toBeNull();
    expect(session.handlers.get("seekto")).toBeNull();

    act(() => element.dispatchEvent(new Event("play")));
    expect(session.playbackState).toBe("playing");

    act(() => session.handlers.get("pause")!({ action: "pause" }));
    expect(element.pause).toHaveBeenCalled();
    act(() => element.dispatchEvent(new Event("pause")));
    expect(api!.paused).toBe(true);
    expect(api!.active).toBe(true);
    expect(session.playbackState).toBe("paused");

    act(() => session.handlers.get("stop")!({ action: "stop" }));
    expect(api!.active).toBe(false);
    expect(session.metadata).toBeNull();
  });

  it("play() не пустили на скрытой вкладке — радио не выключается", async () => {
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(A, null),
    );
    const element = await startAirRadio();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    vi.mocked(musicRadioHeartbeat).mockImplementation(async () =>
      airState(B, C),
    );
    element.play.mockImplementationOnce(() =>
      Promise.reject(
        Object.assign(new Error("denied"), { name: "NotAllowedError" }),
      ),
    );
    vi.setSystemTime(new Date("2030-01-01T10:01:05.000Z"));
    act(() => {
      element.ended = true;
      element.dispatchEvent(new Event("ended"));
    });
    element.ended = false;
    await flush();
    expect(api!.active).toBe(true);

    // Вернулись на вкладку — звук запускается снова.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    const plays = element.play.mock.calls.length;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(element.play.mock.calls.length).toBeGreaterThan(plays);
    await flush();
    expect(api!.active).toBe(true);
  });

  it("возврат на вкладку — догоняет эфир, если отстали", async () => {
    const element = await startAirRadio();
    element.dispatchEvent(new Event("loadedmetadata"));
    element.currentTime = 31;
    vi.setSystemTime(new Date("2030-01-01T10:00:50.000Z"));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(element.currentTime).toBe(50);
  });
});
