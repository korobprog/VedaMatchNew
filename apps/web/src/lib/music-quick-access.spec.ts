import { describe, expect, it } from "vitest";
import type {
  MusicPlaybackStateDto,
  MusicTrackDetailDto,
} from "@vedamatch/shared";
import { buildMusicQuickAccess } from "./music-quick-access";

function track(over: Partial<MusicTrackDetailDto> = {}): MusicTrackDetailDto {
  return {
    id: "t1",
    title: "Шри Гуру-вандана",
    artist: { id: "a1", slug: "audarya", name: "Аударья Дхама дас" },
    album: null,
    categories: [],
    durationSeconds: 406,
    coverUrl: null,
    language: null,
    isLiveRecording: false,
    playCount: 0,
    publishedAt: null,
    lyrics: { text: null, transliteration: null, translation: null },
    status: "published",
    sizeBytes: 0,
    bitrateKbps: null,
    moderationNote: null,
    ...over,
  } as MusicTrackDetailDto;
}

function state(over: Partial<MusicPlaybackStateDto> = {}): MusicPlaybackStateDto {
  return {
    trackId: "t1",
    positionSeconds: 154,
    queue: [],
    repeat: "off",
    shuffle: false,
    updatedAt: null,
    ...over,
  };
}

describe("buildMusicQuickAccess", () => {
  // Пустая карточка на самой посещаемой странице портала — это место,
  // занятое ради ничего.
  it("returns null when there is nothing to resume and no favorites", () => {
    expect(
      buildMusicQuickAccess({ state: null, track: null, favoritesCount: 0 }),
    ).toBeNull();
  });

  it("renders for favorites alone, without anything to resume", () => {
    const data = buildMusicQuickAccess({
      state: null,
      track: null,
      favoritesCount: 42,
    });
    expect(data).not.toBeNull();
    expect(data?.resume).toBeNull();
    expect(data?.favoritesCount).toBe(42);
  });

  it("builds the resume card with progress and what is left", () => {
    const data = buildMusicQuickAccess({
      state: state(),
      track: track(),
      favoritesCount: 0,
    });
    expect(data?.resume).toMatchObject({
      trackId: "t1",
      title: "Шри Гуру-вандана",
      artistName: "Аударья Дхама дас",
      positionSeconds: 154,
      remainingLabel: "осталось 4:12",
    });
    expect(data?.resume?.percent).toBeCloseTo(37.93, 1);
  });

  // Кнопка пуска отдаёт эту секунду плееру: позиция с чужого устройства не
  // должна уехать за длительность и начать воспроизведение в пустоте.
  it("clamps the resume position to the length of the record", () => {
    const data = buildMusicQuickAccess({
      state: state({ positionSeconds: 100_000 }),
      track: track({ durationSeconds: 406 }),
      favoritesCount: 0,
    });
    expect(data?.resume?.positionSeconds).toBe(406);
  });

  // Состояние и карточка приезжают двумя запросами: между ними человек мог
  // переключить запись на другом устройстве.
  it("drops the resume card when state and track disagree", () => {
    const data = buildMusicQuickAccess({
      state: state({ trackId: "t9" }),
      track: track({ id: "t1" }),
      favoritesCount: 3,
    });
    expect(data?.resume).toBeNull();
    expect(data?.favoritesCount).toBe(3);
  });

  it("says nothing about what is left once the record is finished", () => {
    const data = buildMusicQuickAccess({
      state: state({ positionSeconds: 406 }),
      track: track({ durationSeconds: 406 }),
      favoritesCount: 1,
    });
    expect(data?.resume?.remainingLabel).toBeNull();
    expect(data?.resume?.percent).toBe(100);
  });

  // Позиция приходит с чужого устройства и может обогнать длительность.
  it("never lets the bar overflow or the remainder go negative", () => {
    const data = buildMusicQuickAccess({
      state: state({ positionSeconds: 100_000 }),
      track: track({ durationSeconds: 406 }),
      favoritesCount: 0,
    });
    expect(data?.resume?.percent).toBe(100);
    expect(data?.resume?.remainingLabel).toBeNull();
  });

  it("survives a track whose duration is unknown", () => {
    const data = buildMusicQuickAccess({
      state: state({ positionSeconds: 30 }),
      track: track({ durationSeconds: 0 }),
      favoritesCount: 0,
    });
    expect(data?.resume?.percent).toBe(0);
    expect(data?.resume?.remainingLabel).toBeNull();
  });

  it("keeps a track without an artist instead of dropping the card", () => {
    const data = buildMusicQuickAccess({
      state: state(),
      track: track({ artist: null }),
      favoritesCount: 0,
    });
    expect(data?.resume?.artistName).toBeNull();
    expect(data?.resume?.title).toBe("Шри Гуру-вандана");
  });
});
