import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import {
  FALLBACK_ARTWORK,
  applyMediaHandlers,
  artworkType,
  buildArtwork,
  buildMediaMetadata,
  mediaSeekDelta,
} from "./media-session";

const track = (over: Partial<MusicTrackDto> = {}): MusicTrackDto => ({
  id: "t1",
  title: "Джая Радха-Мадхава",
  artist: { id: "a1", slug: "audarya", name: "Аударья Дхама дас" },
  album: { id: "al1", slug: "evening", title: "Вечерняя программа" },
  categories: [],
  durationSeconds: 198,
  coverUrl: "https://cdn.example.org/cover.jpg",
  language: "sa",
  isLiveRecording: true,
  lineage: "iskcon",
  playCount: 0,
  publishedAt: null,
  ...over,
});

describe("buildMediaMetadata", () => {
  it("собирает карточку для экрана блокировки", () => {
    expect(buildMediaMetadata(track())).toEqual({
      title: "Джая Радха-Мадхава",
      artist: "Аударья Дхама дас",
      album: "Вечерняя программа",
      artwork: ["96x96", "192x192", "512x512"].map((sizes) => ({
        src: "https://cdn.example.org/cover.jpg",
        sizes,
        type: "image/jpeg",
      })),
    });
  });

  it("без исполнителя пишет честную строку, а не пустоту", () => {
    // Системная карточка не умеет «пусто»: там останется полоса под
    // названием, и выглядит это как незагрузившиеся данные.
    expect(buildMediaMetadata(track({ artist: null })).artist).toBe(
      "Исполнитель не указан",
    );
  });

  it("без альбома подставляет портал", () => {
    expect(buildMediaMetadata(track({ album: null })).album).toBe("VedaMatch");
  });

  it("без обложки ставит значок портала, а не битую картинку (VED-393)", () => {
    // Ссылка в никуда на экране блокировки хуже заглушки, а серая нота
    // системы не говорит, чей это плеер.
    const artwork = buildMediaMetadata(track({ coverUrl: null })).artwork;
    expect(artwork.map((item) => item.src)).toEqual([
      FALLBACK_ARTWORK,
      FALLBACK_ARTWORK,
      FALLBACK_ARTWORK,
    ]);
    expect(artwork[0].type).toBe("image/png");
  });

  it("название берёт как есть — его правит редакция, а не плеер", () => {
    expect(buildMediaMetadata(track({ title: "  Гаура-арати  " })).title).toBe(
      "  Гаура-арати  ",
    );
  });
});

describe("обложка на экране блокировки (VED-393)", () => {
  it("тип — по расширению, с учётом адреса с подписью", () => {
    expect(artworkType("https://s3.example/c.webp?X-Amz-Signature=1")).toBe("image/webp");
    expect(artworkType("/covers/a.PNG")).toBe("image/png");
    expect(artworkType("/covers/a.jpeg#x")).toBe("image/jpeg");
  });

  it("незнакомый тип не выдумывает", () => {
    // Жёсткий image/jpeg на WebP-файле система вправе отбросить.
    expect(artworkType("/music/covers/abc")).toBeUndefined();
    expect(buildArtwork("/music/covers/abc")[0]).toEqual({
      src: "/music/covers/abc",
      sizes: "96x96",
    });
  });

  it("даёт размеры под уведомление и под экран блокировки", () => {
    expect(buildArtwork("/c.jpg").map((item) => item.sizes)).toEqual([
      "96x96",
      "192x192",
      "512x512",
    ]);
  });
});

describe("перемотка из системной карточки (VED-388)", () => {
  const steps = { back: 10, forward: 30 };

  it("без seekOffset берёт шаг из настроек, свой для каждой стороны", () => {
    expect(mediaSeekDelta(-1, undefined, steps)).toBe(-10);
    expect(mediaSeekDelta(1, undefined, steps)).toBe(30);
  });

  it("присланный системой шаг уважает, мусор — нет", () => {
    expect(mediaSeekDelta(1, 5, steps)).toBe(5);
    expect(mediaSeekDelta(-1, 0, steps)).toBe(-10);
    expect(mediaSeekDelta(-1, Number.NaN, steps)).toBe(-10);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "mediaSession");
  });

  it("seekbackward и seekforward зовут перемотку с шагами настроек", () => {
    const handlers = new Map<string, (details: MediaSessionActionDetails) => void>();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        setActionHandler: (
          action: string,
          handler: (details: MediaSessionActionDetails) => void,
        ) => handlers.set(action, handler),
      },
    });
    const seekBy = vi.fn();

    applyMediaHandlers(
      {
        play: vi.fn(),
        pause: vi.fn(),
        nextTrack: vi.fn(),
        previousTrack: vi.fn(),
        seekTo: vi.fn(),
        seekBy,
      },
      steps,
    );
    handlers.get("seekbackward")?.({ action: "seekbackward" });
    handlers.get("seekforward")?.({ action: "seekforward" });

    expect(seekBy.mock.calls).toEqual([[-10], [30]]);
  });

  it("«стоп» из шторки ставит на паузу, а не закрывает плеер (VED-393)", () => {
    const handlers = new Map<string, (details: MediaSessionActionDetails) => void>();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        setActionHandler: (
          action: string,
          handler: (details: MediaSessionActionDetails) => void,
        ) => handlers.set(action, handler),
      },
    });
    const pause = vi.fn();
    applyMediaHandlers(
      {
        play: vi.fn(),
        pause,
        nextTrack: vi.fn(),
        previousTrack: vi.fn(),
        seekTo: vi.fn(),
        seekBy: vi.fn(),
      },
      steps,
    );
    handlers.get("stop")?.({ action: "stop" });
    expect(pause).toHaveBeenCalledOnce();
    // Весь набор кнопок экрана блокировки на месте.
    expect([...handlers.keys()].sort()).toEqual(
      [
        "nexttrack",
        "pause",
        "play",
        "previoustrack",
        "seekbackward",
        "seekforward",
        "seekto",
        "stop",
      ].sort(),
    );
  });
});
