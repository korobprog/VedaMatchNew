import { describe, expect, it } from "vitest";
import type { MusicRadioItemDto, MusicTrackDto } from "@vedamatch/shared";
import {
  radioHandoffPosition,
  radioHandoffStep,
  radioHandoffTrackId,
} from "./radio-handoff";

const track = { id: "t1", title: "Трек" } as MusicTrackDto;

const item = (over: Partial<MusicRadioItemDto> = {}): MusicRadioItemDto => ({
  slotId: "s1",
  kind: "track",
  startsAt: "2030-01-01T10:00:00.000Z",
  durationMs: 200_000,
  track,
  insertTitle: null,
  streamUrl: "https://s3/t1.mp3",
  ...over,
});

describe("radioHandoffTrackId", () => {
  it("запись каталога — её id", () => {
    expect(radioHandoffTrackId(item())).toBe("t1");
  });

  it("вставке, пустому эфиру и записи без карточки переносить нечего", () => {
    expect(
      radioHandoffTrackId(
        item({ kind: "insert", track: null, insertTitle: "Анонс" }),
      ),
    ).toBeNull();
    expect(radioHandoffTrackId(item({ track: null }))).toBeNull();
    expect(radioHandoffTrackId(null)).toBeNull();
  });
});

describe("radioHandoffPosition", () => {
  it("берёт то, что слышно из элемента радио", () => {
    expect(radioHandoffPosition(item(), 42.5, 44)).toBe(42.5);
  });

  it("элемент ещё не знает позиции — считает по эфиру", () => {
    expect(radioHandoffPosition(item(), 0, 12.3)).toBe(12.3);
    expect(radioHandoffPosition(item(), null, 12.3)).toBe(12.3);
    expect(radioHandoffPosition(item(), Number.NaN, 7)).toBe(7);
  });

  it("не дальше длины записи в эфире и не меньше нуля", () => {
    expect(radioHandoffPosition(item(), 999, 999)).toBe(200);
    expect(radioHandoffPosition(item(), null, -5)).toBe(0);
  });
});

describe("radioHandoffStep", () => {
  it("плеер «играет», но звука ещё нет — радио звучит дальше", () => {
    expect(
      radioHandoffStep({ isPlaying: true, isLoading: true, loadError: null }),
    ).toBe("wait");
    expect(
      radioHandoffStep({ isPlaying: false, isLoading: false, loadError: null }),
    ).toBe("wait");
  });

  it("плеер зазвучал — радио уступает", () => {
    expect(
      radioHandoffStep({ isPlaying: true, isLoading: false, loadError: null }),
    ).toBe("finish");
  });

  it("плеер не смог — переход отменяется, эфир остаётся", () => {
    expect(
      radioHandoffStep({
        isPlaying: false,
        isLoading: false,
        loadError: "Запись не открывается",
      }),
    ).toBe("cancel");
  });
});
