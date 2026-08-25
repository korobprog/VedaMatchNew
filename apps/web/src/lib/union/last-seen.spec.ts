import { describe, expect, it } from "vitest";
import { lastSeenLabel } from "./last-seen";

const now = new Date("2026-08-25T14:30:00");

function ago(ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

const minute = 60_000;
const hour = 60 * minute;

describe("lastSeenLabel", () => {
  it("молчит о тех, кто давно не заходил", () => {
    expect(lastSeenLabel("long_ago", null, now)).toBeNull();
    expect(lastSeenLabel(null, null, now)).toBeNull();
  });

  it("не уточняет время у тех, кто в сети прямо сейчас", () => {
    expect(lastSeenLabel("online", ago(2 * minute), now)).toBe("В сети");
  });

  it("свежий визит считает в минутах", () => {
    expect(lastSeenLabel("today", ago(12 * minute), now)).toBe(
      "Был(а) 12 минут назад",
    );
    expect(lastSeenLabel("today", ago(minute), now)).toBe(
      "Был(а) 1 минуту назад",
    );
  });

  it("сегодняшний визит считает в часах", () => {
    expect(lastSeenLabel("today", ago(2 * hour), now)).toBe(
      "Был(а) 2 часа назад",
    );
    expect(lastSeenLabel("today", ago(5 * hour), now)).toBe(
      "Был(а) 5 часов назад",
    );
  });

  it("вчерашний визит называет по часам", () => {
    // 20 часов назад — это ещё «сегодня» по счётчику, но уже вчера по
    // календарю, и «20 часов назад» пришлось бы пересчитывать в уме.
    expect(lastSeenLabel("today", ago(20 * hour), now)).toBe(
      "Был(а) вчера в 18:30",
    );
  });

  it("более давний визит называет днём недели", () => {
    // 25 августа 2026 — вторник, значит три дня назад была суббота, и
    // склонение должно быть «в субботу», а не «в суббота» от Intl.
    expect(lastSeenLabel("week", ago(3 * 24 * hour), now)).toBe(
      "Был(а) в субботу в 14:30",
    );
  });

  it("без точного времени остаётся огрублённая подпись", () => {
    expect(lastSeenLabel("today", null, now)).toBe("Был(а) сегодня");
    expect(lastSeenLabel("week", null, now)).toBe("Был(а) на этой неделе");
  });

  it("переживает расхождение часов клиента и сервера", () => {
    // Визит «из будущего» на минуту — обычное дело; «-1 минуту назад»
    // выглядело бы поломкой.
    expect(lastSeenLabel("today", ago(-minute), now)).toBe("В сети");
  });

  it("переживает битую дату", () => {
    expect(lastSeenLabel("today", "не дата", now)).toBe("Был(а) сегодня");
  });
});
