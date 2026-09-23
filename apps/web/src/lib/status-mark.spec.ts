import { describe, expect, it } from "vitest";
import type { TaskStatusMark } from "@vedamatch/shared";
import { taskStatusMarkLabel, taskStatusMarkView } from "./status-mark";

const ALL: TaskStatusMark[] = ["in_progress", "testing", "done", "rework"];

describe("taskStatusMarkView", () => {
  /**
   * Слово — ровно название колонки доски, включая «Тестерование» через «е»:
   * так она называется у заказчика, и подменять её написание в ярлыке значит
   * показывать человеку не то слово, на которое он нажимал (VED-312).
   */
  it("даёт слово каждому из четырёх состояний", () => {
    expect(taskStatusMarkView("in_progress")?.label).toBe("В работе");
    expect(taskStatusMarkView("testing")?.label).toBe("Тестерование");
    expect(taskStatusMarkView("done")?.label).toBe("Выполнено");
    expect(taskStatusMarkView("rework")?.label).toBe("На доработку");
  });

  it("без ярлыка возвращает null", () => {
    expect(taskStatusMarkView(null)).toBeNull();
    expect(taskStatusMarkView(undefined)).toBeNull();
    // Код из сборки с другим набором значков не должен ронять ленту.
    expect(taskStatusMarkView("backlog" as TaskStatusMark)).toBeNull();
  });

  /**
   * Цвет — не единственная примета: дальтонику и в чёрно-белой печати ярлык
   * обязан читаться словом. Знака рядом со словом больше нет (VED-312),
   * поэтому слово остаётся единственной приметой, не зависящей от зрения.
   */
  it("у каждого состояния своё слово и свой цвет", () => {
    const views = ALL.map((mark) => taskStatusMarkView(mark)!);
    expect(new Set(views.map((view) => view.label)).size).toBe(ALL.length);
    expect(new Set(views.map((view) => view.className)).size).toBe(ALL.length);
  });

  /**
   * Хардкод `#RRGGBB` пережил бы переключение темы и остался бы от чужой.
   * Цвета — пары токенов `--vm-mark-*`: заказчик просил тёмные тона, они
   * живут на светлой теме, а тёмная берёт осветлённый тон той же краски.
   */
  it("цвета берутся токенами темы, без хардкода", () => {
    for (const mark of ALL) {
      const { className } = taskStatusMarkView(mark)!;
      expect(className).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(className).toMatch(
        /^border-mark-(progress|testing|done|rework)\/60 text-mark-(progress|testing|done|rework)$/,
      );
    }
  });

  /** Своей заливки у ярлыка нет: она роняет контраст подписи ниже AA. */
  it("ярлык не заливает подложку цветом", () => {
    for (const mark of ALL) {
      expect(taskStatusMarkView(mark)!.className).not.toMatch(/\bbg-/);
    }
  });
});

describe("taskStatusMarkLabel", () => {
  it("читается скринридером целой фразой", () => {
    expect(taskStatusMarkLabel(taskStatusMarkView("done")!)).toBe(
      "Статус: Выполнено",
    );
  });
});

/**
 * VED-298: «если уведомление о комментарии не имеет своего статуса, добавь ей
 * цветной статус Комментарий».
 */
describe("значок «Комментарий»", () => {
  it("подписан словом «Комментарий» и читается скринридером", () => {
    const view = taskStatusMarkView("comment")!;
    expect(view.label).toBe("Комментарий");
    expect(taskStatusMarkLabel(view)).toBe("Статус: Комментарий");
  });

  it("свой цвет токеном, не совпадающий ни с одним состоянием, без заливки", () => {
    const { className } = taskStatusMarkView("comment")!;
    expect(className).toBe("border-mark-comment/60 text-mark-comment");
    for (const mark of ALL) {
      expect(taskStatusMarkView(mark)!.className).not.toBe(className);
    }
    expect(className).not.toMatch(/\bbg-|#[0-9a-f]{3,8}/i);
  });
});

/**
 * VED-320: «Статус для таких задач, которые составил другой админ и он же
 * исполнитель, — Чужое. Цвет — тёмно-синий».
 */
describe("значок «Чужое»", () => {
  it("подписан словом «Чужое» и читается скринридером", () => {
    const view = taskStatusMarkView("foreign")!;
    expect(view.label).toBe("Чужое");
    expect(taskStatusMarkLabel(view)).toBe("Статус: Чужое");
  });

  it("свой токен и пунктирная рамка — не спутать с «Выполнено»", () => {
    const { className } = taskStatusMarkView("foreign")!;
    expect(className).toContain("text-mark-foreign");
    expect(className).toContain("border-dashed");
    expect(className).not.toBe(taskStatusMarkView("done")!.className);
    expect(className).not.toMatch(/\bbg-|#[0-9a-f]{3,8}/i);
  });
});
