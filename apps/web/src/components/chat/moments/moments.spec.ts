import { describe, expect, it } from "vitest";
import type { ChatMomentDto, ChatMomentRing } from "@vedamatch/shared";
import {
  firstUnseenIndex,
  remainingLabel,
  removeAuthor,
  slideMs,
  sortRings,
  upsertRing,
} from "./moments";

function ring(part: Partial<ChatMomentRing> & { id?: string } = {}): ChatMomentRing {
  const { id = "u", ...rest } = part;
  return {
    author: { id, name: "Кто-то", avatarUrl: null, lastSeenAt: null },
    mine: false,
    total: 1,
    unseen: 0,
    previewUrl: null,
    previewBackground: null,
    lastPublishedAt: "2026-09-06T10:00:00.000Z",
    ...rest,
  };
}

function moment(part: Partial<ChatMomentDto> = {}): ChatMomentDto {
  return {
    id: "m",
    author: { id: "u", name: "Кто-то", avatarUrl: null, lastSeenAt: null },
    mine: false,
    kind: "text",
    caption: "Ом",
    url: null,
    width: null,
    height: null,
    background: 0,
    audience: "contacts",
    viewsCount: 0,
    viewedByMe: false,
    createdAt: "2026-09-06T10:00:00.000Z",
    expiresAt: "2026-09-07T10:00:00.000Z",
    ...part,
  };
}

describe("порядок колец", () => {
  it("своё первое, даже когда всё просмотрено", () => {
    const sorted = sortRings([
      ring({ id: "a", unseen: 5 }),
      ring({ id: "me", mine: true }),
    ]);
    expect(sorted[0]!.mine).toBe(true);
  });

  it("непросмотренное раньше просмотренного, даже если то свежее", () => {
    const sorted = sortRings([
      ring({ id: "a", unseen: 0, lastPublishedAt: "2026-09-06T23:00:00.000Z" }),
      ring({ id: "b", unseen: 1, lastPublishedAt: "2026-09-06T01:00:00.000Z" }),
    ]);
    expect(sorted[0]!.author.id).toBe("b");
  });
});

describe("живое обновление полосы", () => {
  it("новое кольцо автора заменяет прежнее, а не встаёт вторым", () => {
    const rings = upsertRing([ring({ id: "a", total: 1 })], ring({ id: "a", total: 2, unseen: 1 }));
    expect(rings).toHaveLength(1);
    expect(rings[0]!.total).toBe(2);
  });

  it("удаление убирает кольцо автора целиком", () => {
    expect(removeAuthor([ring({ id: "a" }), ring({ id: "b" })], "a")).toHaveLength(1);
  });
});

describe("с какого момента открывать", () => {
  it("с первого непросмотренного", () => {
    expect(
      firstUnseenIndex([
        moment({ viewedByMe: true }),
        moment({ viewedByMe: false }),
      ]),
    ).toBe(1);
  });

  it("просмотренное целиком открывается с начала", () => {
    expect(firstUnseenIndex([moment({ viewedByMe: true })])).toBe(0);
  });
});

describe("длительность слайда", () => {
  it("у фотографии одна и та же", () => {
    expect(slideMs(moment({ kind: "photo", caption: "" }))).toBe(5000);
  });

  it("у длинной записки больше, чем у короткой", () => {
    const short = slideMs(moment({ caption: "Ом" }));
    const long = slideMs(moment({ caption: "я".repeat(200) }));
    expect(long).toBeGreaterThan(short);
  });

  it("даже очень длинную не держит бесконечно", () => {
    expect(slideMs(moment({ caption: "я".repeat(5000) }))).toBe(15000);
  });
});

describe("сколько осталось", () => {
  const now = new Date("2026-09-06T10:00:00.000Z");

  it("часы, пока их больше одного", () => {
    expect(remainingLabel("2026-09-06T13:00:00.000Z", now)).toBe("3 ч");
  });

  it("минуты на последнем часу", () => {
    expect(remainingLabel("2026-09-06T10:20:00.000Z", now)).toBe("20 мин");
  });

  it("истёкший так и подписан, а не отрицательным числом", () => {
    expect(remainingLabel("2026-09-06T09:00:00.000Z", now)).toBe("истёк");
  });
});
