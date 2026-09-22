import { describe, expect, it } from "vitest";
import { notificationCategoryRows } from "./notification-categories";

/**
 * VED-361: у звонков свой выключатель, и настройки обязаны объяснять, что
 * именно он выключает. Проверяем не вёрстку, а обещание — иначе строка
 * «перестанут приходить сообщения, звонки продолжат звонить» разойдётся с
 * правилом доставки при первой же правке.
 */

function row(preferences: { chat: boolean; calls: boolean }, key: string) {
  const found = notificationCategoryRows(preferences).find(
    (item) => item.key === key,
  );
  if (!found) throw new Error(`нет строки ${key}`);
  return found;
}

describe("notificationCategoryRows", () => {
  it("у звонков своя строка, отдельная от сообщений", () => {
    const keys = notificationCategoryRows({ chat: true, calls: true }).map(
      (item) => item.key,
    );
    expect(keys).toContain("chat");
    expect(keys).toContain("calls");
    // Порядок важен: тумблеры ссылаются друг на друга словами «ниже» и
    // «выше», и перестановка сделала бы подсказку неверной.
    expect(keys.indexOf("calls")).toBe(keys.indexOf("chat") + 1);
  });

  it("включённые «Сообщения» обещают, что звонки продолжат звонить", () => {
    expect(row({ chat: true, calls: true }, "chat").note).toBe(
      "Выключите — перестанут приходить сообщения, звонки продолжат звонить.",
    );
  });

  it("включённые «Звонки» обещают, что сообщения продолжат приходить", () => {
    expect(row({ chat: true, calls: true }, "calls").note).toContain(
      "сообщения продолжат приходить",
    );
  });

  it("выключенные «Сообщения» говорят, что звонки работают", () => {
    const note = row({ chat: false, calls: true }, "chat").note ?? "";
    expect(note).toContain("Звонки при этом звонят");
  });

  it("выключенные «Звонки» говорят, что сообщения работают", () => {
    const note = row({ chat: true, calls: false }, "calls").note ?? "";
    expect(note).toContain("Сообщения при этом приходят");
  });

  it("прочим категориям объяснение не навязывается", () => {
    const rows = notificationCategoryRows({ chat: true, calls: true });
    const explained = rows.filter((item) => item.note !== null);
    expect(explained.map((item) => item.key)).toEqual(["chat", "calls"]);
  });

  it("список по-прежнему несёт все прежние тумблеры", () => {
    const keys = notificationCategoryRows({ chat: true, calls: true }).map(
      (item) => item.key,
    );
    for (const key of [
      "connections",
      "support",
      "transits",
      "market",
      "notices",
      "motivation",
      "music",
      "work",
      "travel",
      "announcements",
      "telegram",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
