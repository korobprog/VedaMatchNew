import { describe, expect, it } from "vitest";
import type { MusicRadioItemDto } from "@vedamatch/shared";
import {
  RADIO_PREFETCH_MIN_GAP_MS,
  radioAfterEnd,
  radioItemAt,
  radioItemTitle,
  radioListenersLabel,
  radioMediaMetadata,
  radioMsLeft,
  radioNextAfter,
  radioOffsetSeconds,
  radioPlayFailure,
  radioServerNow,
  radioShouldPrefetch,
  radioSlotLeftMs,
  radioSyncPlan,
} from "./radio-sync";

const item = (
  slotId: string,
  startsAt: string,
  durationMs: number,
  over: Partial<MusicRadioItemDto> = {},
): MusicRadioItemDto => ({
  slotId,
  kind: "track",
  startsAt,
  durationMs,
  track: null,
  insertTitle: null,
  streamUrl: null,
  ...over,
});

describe("radio-sync", () => {
  it("серверное время идёт вперёд по часам устройства", () => {
    const now = radioServerNow(
      { serverTime: "2030-01-01T10:00:00.000Z" },
      5_000,
      7_500,
    );
    expect(now).toBe(Date.parse("2030-01-01T10:00:02.500Z"));
  });

  it("часы устройства назад не отматывают", () => {
    const now = radioServerNow(
      { serverTime: "2030-01-01T10:00:00.000Z" },
      5_000,
      1_000,
    );
    expect(now).toBe(Date.parse("2030-01-01T10:00:00.000Z"));
  });

  it("позиция внутри записи, в пределах её длительности", () => {
    const a = item("a", "2030-01-01T10:00:00Z", 60_000);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T10:00:12Z"))).toBe(12);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T09:59:00Z"))).toBe(0);
    expect(radioOffsetSeconds(a, Date.parse("2030-01-01T10:05:00Z"))).toBe(60);
    expect(radioMsLeft(a, Date.parse("2030-01-01T10:00:50Z"))).toBe(10_000);
  });

  it("устаревший ответ: текущее отзвучало — берём следующее", () => {
    const state = {
      current: item("a", "2030-01-01T10:00:00Z", 60_000),
      next: item("b", "2030-01-01T10:01:00Z", 60_000),
    };
    expect(radioItemAt(state, Date.parse("2030-01-01T10:00:30Z"))?.slotId).toBe(
      "a",
    );
    expect(radioItemAt(state, Date.parse("2030-01-01T10:01:00Z"))?.slotId).toBe(
      "b",
    );
    expect(radioItemAt(state, Date.parse("2030-01-01T10:03:00Z"))).toBeNull();
  });

  it("подписи", () => {
    expect(radioListenersLabel(1)).toBe("1 слушает");
    expect(radioListenersLabel(5)).toBe("5 слушают");
    expect(radioListenersLabel(22)).toBe("22 слушают");
    expect(
      radioItemTitle(
        item("i", "2030-01-01T10:00:00Z", 1, {
          kind: "insert",
          insertTitle: "Объявление",
        }),
      ),
    ).toBe("Объявление");
  });
});

const at = (iso: string) => Date.parse(iso);

describe("radio-sync: переход по концу записи (VED-543)", () => {
  const a = item("a", "2030-01-01T10:00:00Z", 60_000, { streamUrl: "/a" });
  const b = item("b", "2030-01-01T10:01:00Z", 60_000, { streamUrl: "/b" });
  const state = { current: a, next: b };

  it("остаток слота — по часам самого <audio>", () => {
    expect(radioSlotLeftMs(a, 50)).toBe(10_000);
    expect(radioSlotLeftMs(a, 61)).toBe(0);
  });

  it("следующая после играющей — только с готовой ссылкой и позже неё", () => {
    expect(radioNextAfter(state, a)?.slotId).toBe("b");
    expect(radioNextAfter(state, b)).toBeNull();
    expect(
      radioNextAfter({ current: a, next: { ...b, streamUrl: null } }, a),
    ).toBeNull();
  });

  it("ended вовремя: следующая с начала", () => {
    expect(radioAfterEnd(state, a, at("2030-01-01T10:01:00.300Z"))).toEqual({
      item: b,
      offset: 0,
    });
  });

  it("файл кончился раньше слота: следующая сразу, не ждём в тишине", () => {
    expect(radioAfterEnd(state, a, at("2030-01-01T10:00:57Z"))).toEqual({
      item: b,
      offset: 0,
    });
  });

  it("звук стоял и отстал: входим в эфир с нужной секунды", () => {
    expect(radioAfterEnd(state, a, at("2030-01-01T10:01:20Z"))).toEqual({
      item: b,
      offset: 20,
    });
  });

  it("следующей в ответе нет — нужен запрос", () => {
    expect(
      radioAfterEnd({ current: a, next: null }, a, at("2030-01-01T10:00:59Z")),
    ).toBeNull();
  });
});

describe("radio-sync: свежий ответ эфира", () => {
  const a = item("a", "2030-01-01T10:00:00Z", 60_000, { streamUrl: "/a" });
  const b = item("b", "2030-01-01T10:01:00Z", 60_000, { streamUrl: "/b" });
  const state = { current: a, next: b };

  it("ничего не играет — включаем то, что в эфире", () => {
    expect(
      radioSyncPlan(state, null, at("2030-01-01T10:00:30Z"), false),
    ).toEqual({ kind: "switch", item: a, offset: 30 });
    expect(
      radioSyncPlan(
        { current: null, next: null },
        null,
        at("2030-01-01T10:00:30Z"),
        false,
      ),
    ).toEqual({ kind: "wait" });
  });

  it("то же в эфире — не трогаем, пока не просят догнать", () => {
    const playing = { item: a, positionSeconds: 5 };
    expect(
      radioSyncPlan(state, playing, at("2030-01-01T10:00:30Z"), false),
    ).toEqual({ kind: "keep" });
    expect(
      radioSyncPlan(state, playing, at("2030-01-01T10:00:30Z"), true),
    ).toEqual({ kind: "seek", offset: 30 });
    expect(
      radioSyncPlan(
        state,
        { item: a, positionSeconds: 27 },
        at("2030-01-01T10:00:30Z"),
        true,
      ),
    ).toEqual({ kind: "keep" });
  });

  it("эфир ушёл вперёд — переключаемся с нужной секунды", () => {
    expect(
      radioSyncPlan(
        state,
        { item: a, positionSeconds: 40 },
        at("2030-01-01T10:01:30Z"),
        false,
      ),
    ).toEqual({ kind: "switch", item: b, offset: 30 });
  });

  it("плеер впереди расписания — назад не отматываем", () => {
    expect(
      radioSyncPlan(
        state,
        { item: b, positionSeconds: 2 },
        at("2030-01-01T10:00:59Z"),
        true,
      ),
    ).toEqual({ kind: "keep" });
  });

  it("предзагрузка: у конца записи и без ссылки на следующую", () => {
    const lonely = { current: a, next: null };
    expect(radioShouldPrefetch(lonely, a, 20_000, 60_000)).toBe(true);
    expect(radioShouldPrefetch(lonely, a, 45_000, 60_000)).toBe(false);
    expect(radioShouldPrefetch(state, a, 20_000, 60_000)).toBe(false);
    expect(
      radioShouldPrefetch(lonely, a, 20_000, RADIO_PREFETCH_MIN_GAP_MS - 1),
    ).toBe(false);
    expect(radioShouldPrefetch(null, a, 1_000, 60_000)).toBe(true);
  });
});

describe("radio-sync: отказ play() и карточка", () => {
  it("AbortError — не ошибка, скрытая вкладка — повторить позже", () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    expect(radioPlayFailure(abort, true)).toBe("ignore");
    expect(radioPlayFailure(abort, false)).toBe("ignore");
    expect(radioPlayFailure(denied, true)).toBe("resume-later");
    expect(radioPlayFailure(denied, false)).toBe("stop");
  });

  it("карточка эфира: запись с альбомом «Радио VM», вставка — своим названием", () => {
    const meta = radioMediaMetadata(
      item("a", "2030-01-01T10:00:00Z", 1, {
        track: {
          id: "t1",
          title: "Киртан",
          artist: { id: "ar", slug: "ar", name: "Исполнитель" },
          album: null,
          categories: [],
          durationSeconds: 1,
          coverUrl: null,
          language: "sa",
          isLiveRecording: false,
          lineage: "iskcon",
          playCount: 0,
          publishedAt: null,
        } as unknown as NonNullable<MusicRadioItemDto["track"]>,
      }),
    );
    expect(meta.title).toBe("Киртан");
    expect(meta.artist).toBe("Исполнитель");
    expect(meta.album).toBe("Радио VM");
    const insert = radioMediaMetadata(
      item("i", "2030-01-01T10:00:00Z", 1, {
        kind: "insert",
        insertTitle: "Объявление",
      }),
    );
    expect(insert).toMatchObject({ title: "Объявление", artist: "Радио VM" });
    expect(insert.artwork.length).toBeGreaterThan(0);
  });
});
