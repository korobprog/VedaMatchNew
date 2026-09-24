import { describe, expect, it } from "vitest";
import {
  chooseSection,
  chooseStatus,
  columnGroupOf,
  orderColumnsByKind,
  placeStatusId,
  splitColumnsByKind,
} from "./task-section";

const columns = [
  { id: "misc", statusMark: null },
  { id: "testing", statusMark: "testing" as const },
  { id: "work", statusMark: null },
  { id: "done", statusMark: "done" as const },
  { id: "music", statusMark: null },
];

describe("разделы и статусы доски", () => {
  it("делит колонки, сохраняя порядок внутри группы", () => {
    const { sections, statuses } = splitColumnsByKind(columns);
    expect(sections.map((column) => column.id)).toEqual([
      "misc",
      "work",
      "music",
    ]);
    expect(statuses.map((column) => column.id)).toEqual(["testing", "done"]);
  });

  it("колонку переставляют внутри её группы", () => {
    expect(columnGroupOf(columns, "done").map((column) => column.id)).toEqual([
      "testing",
      "done",
    ]);
    expect(columnGroupOf(columns, "work").map((column) => column.id)).toEqual([
      "misc",
      "work",
      "music",
    ]);
  });

  it("показывает сначала разделы, потом статусы", () => {
    expect(orderColumnsByKind(columns).map((column) => column.id)).toEqual([
      "misc",
      "work",
      "music",
      "testing",
      "done",
    ]);
  });
});

describe("место задачи в окне", () => {
  it("статус — колонка статуса, где стоит задача", () => {
    expect(placeStatusId({ columnId: "done", sectionId: "work" }, columns)).toBe(
      "done",
    );
    expect(placeStatusId({ columnId: "work", sectionId: "work" }, columns)).toBe(
      "",
    );
  });

  it("новый раздел у задачи без статуса — переезд в него", () => {
    expect(
      chooseSection({ columnId: "work", sectionId: "work" }, "music", columns),
    ).toEqual({ columnId: "music", sectionId: "music" });
  });

  it("новый раздел у задачи в статусе — статус остаётся", () => {
    expect(
      chooseSection({ columnId: "testing", sectionId: "work" }, "music", columns),
    ).toEqual({ columnId: "testing", sectionId: "music" });
  });

  it("статус — переезд в его колонку, раздел помнится", () => {
    expect(
      chooseStatus({ columnId: "work", sectionId: "work" }, "testing", columns),
    ).toEqual({ columnId: "testing", sectionId: "work" });
  });

  it("«Без статуса» возвращает в свой раздел", () => {
    expect(
      chooseStatus({ columnId: "done", sectionId: "music" }, "", columns),
    ).toEqual({ columnId: "music", sectionId: "music" });
  });

  it("«Без статуса» при неизвестном разделе — в первый раздел доски", () => {
    expect(
      chooseStatus({ columnId: "done", sectionId: null }, "", columns),
    ).toEqual({ columnId: "misc", sectionId: "misc" });
  });

  it("разделов нет вовсе — место не меняется", () => {
    const onlyStatuses = columns.filter((column) => column.statusMark);
    expect(
      chooseStatus({ columnId: "done", sectionId: null }, "", onlyStatuses),
    ).toEqual({ columnId: "done", sectionId: null });
  });
});
