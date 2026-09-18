import { describe, expect, it } from "vitest";
import { groupTasksByCreatedDate } from "./task-created-grouping";

/** «Сегодня» зафиксировано, чтобы границы суток не зависели от часа запуска
 *  теста. Полдень — намеренно: не задевает полночь ни в одну сторону. */
const NOW = new Date(2026, 8, 18, 12, 0, 0);

function task(id: string, createdAt: string) {
  return { id, createdAt };
}

function isoAt(dayOffset: number, hour = 12): string {
  const date = new Date(2026, 8, 18 + dayOffset, hour, 0, 0);
  return date.toISOString();
}

describe("groupTasksByCreatedDate", () => {
  it("раскладывает по всем бакетам: сегодня, вчера, на этой неделе, раньше", () => {
    const groups = groupTasksByCreatedDate(
      [
        task("today", isoAt(0)),
        task("yesterday", isoAt(-1)),
        task("week", isoAt(-3)),
        task("earlier", isoAt(-9)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "week",
      "earlier",
    ]);
    expect(groups.map((g) => g.title)).toEqual([
      "Сегодня",
      "Вчера",
      "На этой неделе",
      "Раньше",
    ]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["today"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["yesterday"]);
    expect(groups[2].tasks.map((t) => t.id)).toEqual(["week"]);
    expect(groups[3].tasks.map((t) => t.id)).toEqual(["earlier"]);
  });

  it("пустые бакеты не рисуются", () => {
    const groups = groupTasksByCreatedDate([task("today", isoAt(0))], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("today");
  });

  it("пустой раздел — пустой список групп", () => {
    expect(groupTasksByCreatedDate([], NOW)).toEqual([]);
  });

  it("самые свежие группы сверху, самые старые — снизу", () => {
    const groups = groupTasksByCreatedDate(
      [
        task("earlier", isoAt(-30)),
        task("today", isoAt(0)),
        task("week", isoAt(-4)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["today", "week", "earlier"]);
  });

  it("внутри бакета новые задачи идут первыми", () => {
    const groups = groupTasksByCreatedDate(
      [
        task("early-morning", isoAt(0, 1)),
        task("noon", isoAt(0, 12)),
        task("late-evening", isoAt(0, 23)),
      ],
      NOW,
    );
    expect(groups[0].tasks.map((t) => t.id)).toEqual([
      "late-evening",
      "noon",
      "early-morning",
    ]);
  });

  it("граница суток — по календарному дню, не по 24 часам", () => {
    // Без пяти минут полночь сегодня и пять минут первого — соседние дни, а
    // разница между ними меньше десяти минут.
    const groups = groupTasksByCreatedDate(
      [task("late-today", isoAt(0, 23)), task("early-yesterday", isoAt(-1, 0))],
      NOW,
    );
    const byId = Object.fromEntries(
      groups.flatMap((group) => group.tasks.map((t) => [t.id, group.bucket])),
    );
    expect(byId["late-today"]).toBe("today");
    expect(byId["early-yesterday"]).toBe("yesterday");
  });

  it("задача «из будущего» (рассинхрон часов) попадает в «Сегодня», а не теряется", () => {
    const future = new Date(2026, 8, 19, 8, 0, 0).toISOString();
    const groups = groupTasksByCreatedDate([task("clock-skew", future)], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("today");
  });

  it("мусор вместо даты не роняет группировку — уходит в «Раньше»", () => {
    const groups = groupTasksByCreatedDate(
      [task("broken", "не дата"), task("today", isoAt(0))],
      NOW,
    );
    const byId = Object.fromEntries(
      groups.flatMap((group) => group.tasks.map((t) => [t.id, group.bucket])),
    );
    expect(byId.broken).toBe("earlier");
    expect(byId.today).toBe("today");
  });

  it("«на этой неделе» — с двух до шести дней назад включительно", () => {
    const groups = groupTasksByCreatedDate(
      [task("day2", isoAt(-2)), task("day6", isoAt(-6)), task("day7", isoAt(-7))],
      NOW,
    );
    const byId = Object.fromEntries(
      groups.flatMap((group) => group.tasks.map((t) => [t.id, group.bucket])),
    );
    expect(byId.day2).toBe("week");
    expect(byId.day6).toBe("week");
    expect(byId.day7).toBe("earlier");
  });
});
