import { describe, expect, it } from "vitest";
import type { NotificationItemDto } from "@vedamatch/shared";
import {
  appendInboxPage,
  countUnreadItems,
  inboxFeedFromPage,
  inboxGroupOf,
  markAllItemsRead,
  markInboxAllRead,
  markItemRead,
  mergeInboxPages,
  openInboxItem,
  setItemRead,
  splitInbox,
  toggleInboxRead,
  withFreshMarks,
  withUnreadTotal,
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

/**
 * VED-143: своя отметка у каждой карточки. Счётчик и группа — здесь чистыми
 * функциями, потому что именно на их расхождении ломается весь замысел:
 * «Новое · 5» над шестью новыми карточками хуже, чем отсутствие кнопки.
 */
describe("setItemRead", () => {
  const now = new Date("2026-09-22T10:00:00.000Z");

  it("гасит одно и не трогает соседнее", () => {
    const items = setItemRead([item("a"), item("b")], "a", true, now);

    expect(items[0].readAt).toBe("2026-09-22T10:00:00.000Z");
    expect(items[1].readAt).toBeNull();
  });

  it("возвращает прочитанное в непрочитанные", () => {
    const items = setItemRead(
      [item("a", "2026-09-21T10:00:00.000Z")],
      "a",
      false,
      now,
    );

    expect(items[0].readAt).toBeNull();
  });

  it("повторное нажатие на ту же сторону не двигает дату", () => {
    const items = setItemRead(
      [item("a", "2026-09-21T10:00:00.000Z")],
      "a",
      true,
      now,
    );

    expect(items[0].readAt).toBe("2026-09-21T10:00:00.000Z");
  });
});

describe("удержание карточки в группе", () => {
  const feed = (items: NotificationItemDto[], unreadTotal = 0) =>
    inboxFeedFromPage({ items, unreadCount: unreadTotal });

  it("нажатая карточка остаётся в «Новом», хотя стала прочитанной", () => {
    // Иначе она уезжает из-под пальца вниз за экран вместе с кнопкой отката.
    const { state } = toggleInboxRead(feed([item("a"), item("b")], 2), "a", true);
    const { unread, read } = splitInbox(state.items, state.holds);

    expect(unread.map((row) => row.id)).toEqual(["a", "b"]);
    expect(read).toHaveLength(0);
    expect(state.items[0].readAt).not.toBeNull();
  });

  it("возвращённая карточка остаётся в «Прочитанном»", () => {
    const start = feed([item("a", "2026-09-21T10:00:00.000Z")], 0);

    const { state } = toggleInboxRead(start, "a", false);

    expect(splitInbox(state.items, state.holds).read.map((row) => row.id)).toEqual(
      ["a"],
    );
    expect(state.items[0].readAt).toBeNull();
  });

  it("без удержаний группа определяется по readAt, как и раньше", () => {
    expect(inboxGroupOf(item("a"))).toBe("unread");
    expect(inboxGroupOf(item("a", "2026-09-21T10:00:00.000Z"))).toBe("read");
  });

  it("откат возвращает карточку в прежний вид, а удержание не мешает", () => {
    const start = feed([item("a"), item("b")], 2);
    const marked = toggleInboxRead(start, "a", true).state;

    const rolledBack = toggleInboxRead(marked, "a", false).state;

    expect(rolledBack.items[0].readAt).toBeNull();
    expect(rolledBack.unreadTotal).toBe(2);
    expect(
      splitInbox(rolledBack.items, rolledBack.holds).unread.map((row) => row.id),
    ).toEqual(["a", "b"]);
  });

  it("перечитанная лента приходит без удержаний: порядок VED-153 применяется", () => {
    const marked = toggleInboxRead(feed([item("a"), item("b")], 2), "a", true)
      .state;

    const reloaded = inboxFeedFromPage({
      items: [item("b"), marked.items[0]],
      unreadCount: 1,
    });

    expect(reloaded.holds.size).toBe(0);
    expect(
      splitInbox(reloaded.items, reloaded.holds).read.map((row) => row.id),
    ).toEqual(["a"]);
  });
});

describe("счётчик непрочитанного при отметке", () => {
  const feed = (items: NotificationItemDto[], unreadTotal: number) =>
    inboxFeedFromPage({ items, unreadCount: unreadTotal });

  it("отметка прочитанным убавляет счётчик на единицу", () => {
    // На единицу, а не пересчётом по загруженному: `unreadTotal` считает всю
    // ленту человека, включая то, до чего он не долистал.
    const { state } = toggleInboxRead(feed([item("a")], 37), "a", true);

    expect(state.unreadTotal).toBe(36);
  });

  it("возврат в непрочитанные прибавляет обратно", () => {
    const start = feed([item("a", "2026-09-21T10:00:00.000Z")], 36);

    expect(toggleInboxRead(start, "a", false).state.unreadTotal).toBe(37);
  });

  it("повторное нажатие не двигает счётчик и не идёт на сервер", () => {
    const start = feed([item("a", "2026-09-21T10:00:00.000Z")], 5);

    const result = toggleInboxRead(start, "a", true);

    expect(result.changed).toBe(false);
    expect(result.state).toBe(start);
  });

  it("неизвестный id ничего не меняет", () => {
    const start = feed([item("a")], 1);

    expect(toggleInboxRead(start, "нет-такого", true).changed).toBe(false);
  });

  it("счётчик не уходит в минус", () => {
    const { state } = toggleInboxRead(feed([item("a")], 0), "a", true);

    expect(state.unreadTotal).toBe(0);
  });

  it("точное число от сервера перебивает арифметику клиента", () => {
    // Пока человек нажимал, в другой вкладке могло прийти новое уведомление.
    const start = feed([item("a")], 36);

    expect(withUnreadTotal(start, 40).unreadTotal).toBe(40);
  });
});

describe("лента целиком", () => {
  it("подгрузка дописывает в хвост и сохраняет удержания", () => {
    const start = inboxFeedFromPage({
      items: [item("a"), item("b")],
      unreadCount: 5,
    });
    const marked = toggleInboxRead(start, "a", true).state;

    const next = appendInboxPage(marked, {
      items: [item("c"), item("a")],
      unreadCount: 4,
    });

    // Дубль «a» с сервера отброшен, удержание живо, счётчик от сервера.
    expect(next.items.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(next.holds.get("a")).toBe("unread");
    expect(next.unreadTotal).toBe(4);
  });

  it("открытое по ссылке уезжает в «Прочитанное»: прыжка никто не увидит", () => {
    const start = inboxFeedFromPage({
      items: [item("a"), item("b")],
      unreadCount: 2,
    });

    const opened = openInboxItem(start, "a");

    expect(opened.unreadTotal).toBe(1);
    expect(
      splitInbox(opened.items, opened.holds).read.map((row) => row.id),
    ).toEqual(["a"]);
  });

  it("«отметить все» гасит показанное и счётчик", () => {
    const start = inboxFeedFromPage({
      items: [item("a"), item("b")],
      unreadCount: 37,
    });

    const all = markInboxAllRead(start);

    expect(countUnreadItems(all.items)).toBe(0);
    expect(all.unreadTotal).toBe(0);
  });
});

describe("withFreshMarks (VED-312)", () => {
  const feed = () =>
    inboxFeedFromPage({
      items: [
        { ...item("a"), mark: "testing" },
        { ...item("b"), mark: "comment" },
        item("c"),
      ],
      unreadCount: 3,
    });

  it("пометка на экране догоняет задачу: «Тестерование» → «На доработку»", () => {
    const next = withFreshMarks(feed(), [
      { ...item("a"), mark: "rework" },
      { ...item("c"), mark: "foreign" },
    ]);
    expect(next.items.map((row) => [row.id, row.mark])).toEqual([
      ["a", "rework"],
      ["b", "comment"],
      ["c", "foreign"],
    ]);
  });

  it("порядок и набор не трогает: новое сверху не вставляется", () => {
    const next = withFreshMarks(feed(), [
      { ...item("new"), mark: "testing" },
      { ...item("c"), mark: "done" },
    ]);
    expect(next.items.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("ничего не поменялось — тот же объект", () => {
    const state = feed();
    expect(withFreshMarks(state, [{ ...item("a"), mark: "testing" }])).toBe(
      state,
    );
  });
});
