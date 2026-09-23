import { afterEach, describe, expect, it, vi } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import {
  applyMediaHandlers,
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
      artwork: [
        {
          src: "https://cdn.example.org/cover.jpg",
          sizes: "512x512",
          type: "image/jpeg",
        },
      ],
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

  it("без обложки не даёт битую картинку", () => {
    // Ссылка в никуда на экране блокировки хуже системной заглушки.
    expect(buildMediaMetadata(track({ coverUrl: null })).artwork).toEqual([]);
  });

  it("название берёт как есть — его правит редакция, а не плеер", () => {
    expect(buildMediaMetadata(track({ title: "  Гаура-арати  " })).title).toBe(
      "  Гаура-арати  ",
    );
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
});
