import { describe, expect, it } from "vitest";
import type { NotificationMark } from "@vedamatch/shared";
import {
  notificationMarkLabel,
  notificationMarkView,
} from "./notification-mark";

const ALL: NotificationMark[] = ["in_progress", "testing", "done", "rework"];

describe("notificationMarkView", () => {
  /**
   * Слово — ровно название колонки доски, включая «Тестерование» через «е»:
   * так она называется у заказчика, и подменять её написание в значке значит
   * показывать человеку не то слово, на которое он нажимал (VED-312).
   */
  it("даёт слово каждому из четырёх состояний", () => {
    expect(notificationMarkView("in_progress")?.label).toBe("В работе");
    expect(notificationMarkView("testing")?.label).toBe("Тестерование");
    expect(notificationMarkView("done")?.label).toBe("Выполнено");
    expect(notificationMarkView("rework")?.label).toBe("На доработку");
  });

  it("без значка возвращает null", () => {
    expect(notificationMarkView(null)).toBeNull();
    expect(notificationMarkView(undefined)).toBeNull();
    // Код из сборки с другим набором значков не должен ронять ленту.
    expect(
      notificationMarkView("backlog" as NotificationMark),
    ).toBeNull();
  });

  /**
   * Цвет — не единственная примета: дальтонику и в чёрно-белой печати значок
   * обязан читаться словом. Знака рядом со словом больше нет (VED-312),
   * поэтому слово остаётся единственной приметой, не зависящей от зрения.
   */
  it("у каждого состояния своё слово и свой цвет", () => {
    const views = ALL.map((mark) => notificationMarkView(mark)!);
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
      const { className } = notificationMarkView(mark)!;
      expect(className).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(className).toMatch(
        /^border-mark-(progress|testing|done|rework)\/60 text-mark-(progress|testing|done|rework)$/,
      );
    }
  });

  /** Своей заливки у значка нет: она роняет контраст подписи ниже AA. */
  it("значок не заливает подложку цветом", () => {
    for (const mark of ALL) {
      expect(notificationMarkView(mark)!.className).not.toMatch(/\bbg-/);
    }
  });
});

describe("notificationMarkLabel", () => {
  it("читается скринридером целой фразой", () => {
    expect(notificationMarkLabel(notificationMarkView("done")!)).toBe(
      "Статус: Выполнено",
    );
  });
});
