import { describe, expect, it } from "vitest";
import type { MusicTrackDto } from "@vedamatch/shared";
import { sortTracks } from "./sort-tracks";

function track(over: Partial<MusicTrackDto> = {}): MusicTrackDto {
  return {
    id: "id",
    title: "Название",
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
    ...over,
  };
}

describe("sortTracks", () => {
  it("режим «дата» — по publishedAt убыванию, новые сверху", () => {
    const tracks = [
      track({ id: "old", title: "Б", publishedAt: "2026-01-01T00:00:00.000Z" }),
      track({ id: "new", title: "А", publishedAt: "2026-06-01T00:00:00.000Z" }),
      track({ id: "mid", title: "В", publishedAt: "2026-03-01T00:00:00.000Z" }),
    ];

    expect(sortTracks(tracks, "date", false).map((t) => t.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("режим «алфавит» — по названию через localeCompare('ru'), с ё и разным регистром", () => {
    const tracks = [
      track({ id: "e", title: "ёлка" }),
      track({ id: "a", title: "Арати" }),
      track({ id: "z", title: "яджна" }),
      track({ id: "zh", title: "Ждать" }),
    ];

    expect(sortTracks(tracks, "alpha", false).map((t) => t.id)).toEqual([
      "a",
      "e",
      "zh",
      "z",
    ]);
  });

  it("reverse переворачивает готовый результат в обоих режимах", () => {
    const tracks = [
      track({ id: "a", title: "А", publishedAt: "2026-01-01T00:00:00.000Z" }),
      track({ id: "b", title: "Б", publishedAt: "2026-06-01T00:00:00.000Z" }),
    ];

    expect(sortTracks(tracks, "date", true).map((t) => t.id)).toEqual([
      "a",
      "b",
    ]);
    expect(sortTracks(tracks, "alpha", true).map((t) => t.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("запись без даты публикации не роняет сравнение и уходит в конец при сортировке по дате", () => {
    const tracks = [
      track({ id: "no-date", title: "А", publishedAt: null }),
      track({ id: "dated", title: "Б", publishedAt: "2026-01-01T00:00:00.000Z" }),
    ];

    expect(sortTracks(tracks, "date", false).map((t) => t.id)).toEqual([
      "dated",
      "no-date",
    ]);
  });

  it("не мутирует исходный массив", () => {
    const tracks = [
      track({ id: "a", title: "Б" }),
      track({ id: "b", title: "А" }),
    ];
    const original = [...tracks];

    sortTracks(tracks, "alpha", false);

    expect(tracks).toEqual(original);
  });
});
