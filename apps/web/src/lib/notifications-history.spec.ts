import { describe, expect, it } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import {
  contactTimeOf,
  groupHistoryByDay,
  historyDayLabel,
  mergeHistoryPages,
  setHistoryItemRead,
} from "./notifications-history";

/** Местное время: подписи «Сегодня» и «Вчера» — про день читателя. */
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute);

function item(
  id: string,
  contact: Date | null,
  patch: Partial<NotificationItemDto> = {},
): NotificationItemDto {
  return {
    id,
    title: id,
    body: "",
    url: `/x/${id}`,
    category: "chat",
    createdAt: local(1, 9).toISOString(),
    readAt: local(1, 10).toISOString(),
    contactAt: contact?.toISOString() ?? null,
    mark: null,
    ...patch,
  };
}

const now = local(24, 12);

describe("historyDayLabel", () => {
  it("сегодня и вчера — словами", () => {
    expect(historyDayLabel(local(24, 0, 5), now)).toBe("Сегодня");
    expect(historyDayLabel(local(23, 23, 59), now)).toBe("Вчера");
  });

  it("раньше — датой, год только не текущий", () => {
    expect(historyDayLabel(local(21, 8), now)).toBe("21 сентября");
    expect(historyDayLabel(new Date(2025, 11, 31, 8), now)).toBe(
      "31 декабря 2025 г.",
    );
  });
});

describe("groupHistoryByDay", () => {
  it("делит по дням контакта и сохраняет порядок сервера", () => {
    const groups = groupHistoryByDay(
      [
        item("a", local(24, 11)),
        item("b", local(24, 8)),
        item("c", local(23, 20)),
        item("d", local(20, 9)),
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Сегодня",
      "Вчера",
      "20 сентября",
    ]);
    expect(groups[0].items.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("день, встретившийся снова, — отдельная группа, карточка не прыгает", () => {
    const groups = groupHistoryByDay(
      [
        item("a", local(24, 11)),
        item("b", local(23, 8)),
        item("c", local(24, 7)),
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Сегодня",
      "Вчера",
      "Сегодня",
    ]);
    expect(new Set(groups.map((group) => group.key)).size).toBe(3);
  });

  it("пустая история — пустой список групп", () => {
    expect(groupHistoryByDay([], now)).toEqual([]);
  });
});

describe("contactTimeOf", () => {
  it("контакт, а без него — прочтение и приход", () => {
    const base = item("a", local(24, 11));
    expect(contactTimeOf(base)).toBe(local(24, 11).toISOString());
    expect(contactTimeOf({ ...base, contactAt: undefined })).toBe(base.readAt);
    expect(
      contactTimeOf({ ...base, contactAt: null, readAt: null }),
    ).toBe(base.createdAt);
  });
});

describe("mergeHistoryPages", () => {
  it("открытое во время листания и пришедшее второй раз не дублируется", () => {
    const merged = mergeHistoryPages(
      [item("a", local(24, 11)), item("b", local(24, 10))],
      [item("a", local(24, 11, 30)), item("c", local(24, 9))],
    );
    expect(merged.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("setHistoryItemRead", () => {
  const items = [item("a", local(23, 11)), item("b", local(23, 10))];

  it("вернуть в непрочитанные — карточка на месте, день не меняется", () => {
    const next = setHistoryItemRead(items, "a", false, now);
    expect(next.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(next[0].readAt).toBeNull();
    expect(next[0].contactAt).toBe(items[0].contactAt);
    expect(next[1]).toBe(items[1]);
  });

  it("снова прочитано — новая дата прочтения только у непрочитанного", () => {
    const unread = setHistoryItemRead(items, "a", false, now);
    const again = setHistoryItemRead(unread, "a", true, now);
    expect(again[0].readAt).toBe(now.toISOString());
    const untouched = setHistoryItemRead(items, "b", true, now);
    expect(untouched[1].readAt).toBe(items[1].readAt);
  });
});
