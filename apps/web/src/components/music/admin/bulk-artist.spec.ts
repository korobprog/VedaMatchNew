import { describe, expect, it } from "vitest";
import type { MusicAdminTrackDto, MusicArtistDto } from "@vedamatch/shared";
import {
  filterByArtist,
  findArtistByName,
  selectionState,
  toggleAllShown,
} from "./bulk-artist";

const artists = [
  { id: "a1", name: "Aindra  das" },
  { id: "a2", name: "Мадхава" },
] as unknown as MusicArtistDto[];

const tracks = [
  { id: "t1", artistId: "a1" },
  { id: "t2", artistId: null },
  { id: "t3", artistId: "a2" },
] as unknown as MusicAdminTrackDto[];

describe("filterByArtist", () => {
  it("все, без исполнителя и конкретный", () => {
    expect(filterByArtist(tracks, "").map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(filterByArtist(tracks, "none").map((t) => t.id)).toEqual(["t2"]);
    expect(filterByArtist(tracks, "a2").map((t) => t.id)).toEqual(["t3"]);
  });
});

describe("findArtistByName", () => {
  it("находит без учёта регистра и лишних пробелов", () => {
    expect(findArtistByName(artists, " AINDRA das ")?.id).toBe("a1");
    expect(findArtistByName(artists, "мадхава")?.id).toBe("a2");
  });

  it("пустое и незнакомое — null", () => {
    expect(findArtistByName(artists, "   ")).toBeNull();
    expect(findArtistByName(artists, "Гаура")).toBeNull();
  });
});

describe("выбор показанных", () => {
  it("считает состояние общей галочки", () => {
    expect(selectionState(["t1", "t2"], new Set())).toBe("none");
    expect(selectionState(["t1", "t2"], new Set(["t1", "t9"]))).toBe("some");
    expect(selectionState(["t1", "t2"], new Set(["t1", "t2"]))).toBe("all");
  });

  it("добавляет показанное и снимает только его", () => {
    const added = toggleAllShown(["t1", "t2"], new Set(["t9"]));
    expect([...added].sort()).toEqual(["t1", "t2", "t9"]);
    const removed = toggleAllShown(["t1", "t2"], added);
    expect([...removed]).toEqual(["t9"]);
  });
});
