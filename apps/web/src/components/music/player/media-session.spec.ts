import { describe, expect, it } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { buildMediaMetadata } from "./media-session";

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
