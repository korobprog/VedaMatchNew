import { describe, expect, it } from "vitest";
import { groupTasksByDueDate } from "./task-due-grouping";

// «Сегодня» зафиксировано на понедельник, 3:00 — время суток не должно
// влиять на границы дня, только дата.
const NOW = new Date(2026, 8, 14, 3, 0);

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();

const task = (id: string, dueAt: string | null) => ({ id, dueAt });

describe("groupTasksByDueDate", () => {
  it("раскладывает по всем бакетам и не выдумывает пустых групп", () => {
    const groups = groupTasksByDueDate(
      [
        task("просрочена-вчера", at(13)),
        task("просрочена-давно", at(1)),
        task("сегодня", at(14, 23)),
        task("завтра", at(15)),
        task("через-3-дня", at(17)),
        task("через-неделю", at(21)), // ровно 7 дней — ещё «на этой неделе»
        task("через-8-дней", at(22)),
        task("без-срока", null),
      ],
      NOW,
    );

    expect(groups.map((group) => group.bucket)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "week",
      "later",
      "none",
    ]);
  });

  it("пустых бакетов нет — раздел без просрочек не рисует «Просрочено»", () => {
    const groups = groupTasksByDueDate([task("сегодня", at(14))], NOW);
    expect(groups.map((group) => group.bucket)).toEqual(["today"]);
  });

  it("в пустом разделе групп нет", () => {
    expect(groupTasksByDueDate([], NOW)).toEqual([]);
  });

  it("без срока — всегда последняя группа, даже если остальных нет", () => {
    const groups = groupTasksByDueDate(
      [task("без-срока", null), task("сегодня", at(14))],
      NOW,
    );
    expect(groups.at(-1)?.bucket).toBe("none");
  });

  it("время суток не сдвигает границу дня: 23:59 — ещё сегодня, 00:01 — уже завтра", () => {
    const groups = groupTasksByDueDate(
      [task("поздно-сегодня", at(14, 23)), task("рано-завтра", at(15, 0))],
      NOW,
    );
    const today = groups.find((group) => group.bucket === "today");
    const tomorrow = groups.find((group) => group.bucket === "tomorrow");
    expect(today?.tasks.map((item) => item.id)).toEqual(["поздно-сегодня"]);
    expect(tomorrow?.tasks.map((item) => item.id)).toEqual(["рано-завтра"]);
  });

  it("внутри группы сортирует по возрастанию срока", () => {
    const groups = groupTasksByDueDate(
      [task("поздняя", at(17, 20)), task("ранняя", at(17, 8))],
      NOW,
    );
    const week = groups.find((group) => group.bucket === "week");
    expect(week?.tasks.map((item) => item.id)).toEqual(["ранняя", "поздняя"]);
  });

  it("«без срока» сохраняет прежний порядок карточек, а не сортирует", () => {
    const groups = groupTasksByDueDate(
      [task("вторая", null), task("первая", null)],
      NOW,
    );
    const none = groups.find((group) => group.bucket === "none");
    expect(none?.tasks.map((item) => item.id)).toEqual(["вторая", "первая"]);
  });

  it("мусор вместо даты уходит в «без срока», а не роняет группировку", () => {
    const groups = groupTasksByDueDate([task("сломана", "не дата")], NOW);
    expect(groups).toEqual([
      { bucket: "none", title: "Без срока", tasks: [task("сломана", "не дата")] },
    ]);
  });
});
