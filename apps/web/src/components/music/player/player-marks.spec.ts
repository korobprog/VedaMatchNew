import { describe, expect, it } from "vitest";
import type { MusicBookmarkDto, MusicListenDto, MusicTrackDto } from "@vedamatch/shared";
import {
  bookmarkJumpLabel,
  bookmarkSavedText,
  bookmarkTitle,
  markPercents,
  historyQueue,
  historyResumeAt,
  historyRows,
  upsertBookmark,
} from "./player-marks";

const mark = (id: string, at: number, label: string | null = null): MusicBookmarkDto => ({
  id,
  trackId: "t1",
  positionSeconds: at,
  label,
  createdAt: `2026-09-24T09:00:0${id.length}.000Z`,
});

const listen = (id: string, position: number | null = null): MusicListenDto => ({
  track: { id, title: id } as MusicTrackDto,
  seconds: 60,
  listenedAt: "2026-09-24T09:00:00.000Z",
  positionSeconds: position,
});

describe("метки", () => {
  it("встают по месту в записи и не повторяются", () => {
    const list = upsertBookmark([mark("a", 300), mark("b", 10)], mark("c", 120));
    expect(list.map((row) => row.id)).toEqual(["b", "c", "a"]);
    const renamed = upsertBookmark(list, mark("c", 120, "припев"));
    expect(renamed).toHaveLength(3);
    expect(renamed[1].label).toBe("припев");
  });

  it("подписи: подпись или время", () => {
    expect(bookmarkTitle(mark("a", 754))).toBe("Метка на 12:34");
    expect(bookmarkTitle(mark("a", 754, "стих 2.13"))).toBe("стих 2.13");
    expect(bookmarkJumpLabel(mark("a", 754, "стих 2.13"))).toBe(
      "Перейти к метке 12:34: стих 2.13",
    );
    expect(bookmarkJumpLabel(mark("a", 5))).toBe("Перейти к метке 0:05");
    expect(bookmarkSavedText(mark("a", 65))).toBe("Метка на 1:05 поставлена");
  });
});

describe("история", () => {
  it("одна строка на запись, свежие сверху, не больше лимита", () => {
    const items = [listen("a"), listen("b"), listen("a"), listen("c")];
    expect(historyRows(items).map((row) => row.track.id)).toEqual(["a", "b", "c"]);
    expect(historyRows(items, 2)).toHaveLength(2);
    expect(historyQueue(items)).toEqual(["a", "b", "c"]);
  });

  it("продолжает с места, только если оно известно", () => {
    expect(historyResumeAt(listen("a", 312))).toBe(312);
    expect(historyResumeAt(listen("a", null))).toBeUndefined();
    expect(historyResumeAt({ ...listen("a"), positionSeconds: undefined })).toBeUndefined();
  });
});

describe("markPercents (VED-450)", () => {
  it("доля длины записи, по порядку, без повторов", () => {
    expect(markPercents([60, 30, 30, 0], 120)).toEqual([0, 25, 50]);
  });

  it("за концом — к концу; мусор и пустая длительность — мимо", () => {
    expect(markPercents([200, -5, Number.NaN], 100)).toEqual([100]);
    expect(markPercents([10], 0)).toEqual([]);
  });
});
