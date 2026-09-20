import { describe, expect, it } from "vitest";
import type { NotificationMark } from "@vedamatch/shared";
import {
  notificationMarkLabel,
  notificationMarkView,
} from "./notification-mark";

const ALL: NotificationMark[] = ["in_progress", "testing", "done", "rework"];

describe("notificationMarkView", () => {
  it("даёт слово каждому из четырёх состояний", () => {
    expect(notificationMarkView("in_progress")?.label).toBe("В работе");
    expect(notificationMarkView("testing")?.label).toBe("Тестирование");
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
   * Цвет — не единственная примета: дальтонику и в чёрно-белой печати значки
   * обязаны различаться словом и знаком.
   */
  it("у каждого состояния свои слово, знак и цвет", () => {
    const views = ALL.map((mark) => notificationMarkView(mark)!);
    expect(new Set(views.map((view) => view.label)).size).toBe(ALL.length);
    expect(new Set(views.map((view) => view.icon)).size).toBe(ALL.length);
    expect(new Set(views.map((view) => view.className)).size).toBe(ALL.length);
  });

  /**
   * Хардкод `#RRGGBB` пережил бы переключение темы и остался бы от чужой.
   * Золота в наборе нет: на светлой теме оно даёт 3,78:1 и мелкой подписи
   * не годится.
   */
  it("цвета берутся токенами темы, без хардкода и без золота", () => {
    for (const mark of ALL) {
      const { className } = notificationMarkView(mark)!;
      expect(className).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(className).not.toMatch(/gold/);
      expect(className).toMatch(/^border-(blue|violet|cyan|magenta)\/60 text-(blue|violet|cyan|magenta)$/);
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
