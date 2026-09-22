import { describe, expect, it } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import {
  countUnreadItems,
  markAllItemsRead,
  markItemRead,
  mergeInboxPages,
  splitInbox,
} from "./notifications-inbox";

const item = (
  id: string,
  readAt: string | null = null,
): NotificationItemDto => ({
  id,
  title: `Уведомление ${id}`,
  body: "Текст",
  url: "/notifications",
  category: "chat",
  createdAt: "2026-09-20T12:00:00.000Z",
  readAt,
  mark: null,
});

describe("mergeInboxPages", () => {
  it("складывает порции подряд, не меняя порядка", () => {
    const merged = mergeInboxPages([item("a"), item("b")], [item("c")]);

    expect(merged.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * Пока человек листает, он открывает уведомления, и прочитанное переезжает
   * из первого потока ленты во второй — за курсором, который уже прошёл мимо.
   * Без этой проверки React получил бы два элемента с одним ключом.
   */
  it("выбрасывает то, что уже показано: строка могла сменить поток", () => {
    const merged = mergeInboxPages(
      [item("a"), item("b")],
      [item("b", "2026-09-20T13:00:00.000Z"), item("c")],
    );

    expect(merged.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(merged[1].readAt).toBeNull();
  });

  it("не трогает исходный список", () => {
    const current = [item("a")];

    mergeInboxPages(current, [item("b")]);

    expect(current).toHaveLength(1);
  });

  it("пустая порция ничего не ломает", () => {
    expect(mergeInboxPages([item("a")], []).map((row) => row.id)).toEqual([
      "a",
    ]);
  });
});

describe("отметки о прочтении", () => {
  const now = new Date("2026-09-22T10:00:00.000Z");

  it("гасит одно уведомление и не трогает остальные", () => {
    const items = markItemRead([item("a"), item("b")], "a", now);

    expect(items[0].readAt).toBe("2026-09-22T10:00:00.000Z");
    expect(items[1].readAt).toBeNull();
  });

  it("повторный клик не сдвигает отметку", () => {
    const already = item("a", "2026-09-21T10:00:00.000Z");

    expect(markItemRead([already], "a", now)[0].readAt).toBe(
      "2026-09-21T10:00:00.000Z",
    );
  });

  it("«отметить все» гасит только непрочитанное", () => {
    const items = markAllItemsRead(
      [item("a"), item("b", "2026-09-21T10:00:00.000Z")],
      now,
    );

    expect(items.map((row) => row.readAt)).toEqual([
      "2026-09-22T10:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
    ]);
  });

  it("считает непрочитанное на экране", () => {
    expect(
      countUnreadItems([item("a"), item("b", "2026-09-21T10:00:00.000Z")]),
    ).toBe(1);
  });
});

describe("splitInbox", () => {
  it("делит на новое и прочитанное, сохраняя порядок сервера", () => {
    const { unread, read } = splitInbox([
      item("a"),
      item("b", "2026-09-21T10:00:00.000Z"),
      item("c"),
      item("d", "2026-09-20T10:00:00.000Z"),
    ]);

    expect(unread.map((row) => row.id)).toEqual(["a", "c"]);
    expect(read.map((row) => row.id)).toEqual(["b", "d"]);
  });
});
