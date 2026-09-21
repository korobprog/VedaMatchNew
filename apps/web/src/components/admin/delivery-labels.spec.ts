import { describe, expect, it } from "vitest";
import {
  daysAgoLabel,
  deliveryKindLabel,
  deliveryStateLabel,
  deliveryStateTone,
  failureStreakLabel,
} from "./delivery-labels";

const now = new Date("2026-09-22T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("deliveryStateLabel", () => {
  it("называет состояния словами", () => {
    expect(deliveryStateLabel("alive")).toBe("Живая");
    expect(deliveryStateLabel("silent")).toBe("Молчит");
    expect(deliveryStateLabel("dead")).toBe("Помечена мёртвой");
  });
});

describe("deliveryStateTone", () => {
  it("молчание — предупреждение, а не приговор", () => {
    expect(deliveryStateTone("silent")).toBe("warn");
    expect(deliveryStateTone("dead")).toBe("bad");
    expect(deliveryStateTone("alive")).toBe("ok");
  });
});

describe("deliveryKindLabel", () => {
  it("браузер, приложение и бот", () => {
    expect(deliveryKindLabel("web")).toBe("Браузер");
    expect(deliveryKindLabel("app")).toBe("Приложение");
    expect(deliveryKindLabel("telegram")).toBe("Telegram");
  });
});

describe("daysAgoLabel", () => {
  it("пустая отметка — «ни разу», а не «только что»", () => {
    expect(daysAgoLabel(null, now)).toBe("ни разу");
    expect(daysAgoLabel("не дата", now)).toBe("ни разу");
  });

  it("сегодня, вчера и дни", () => {
    expect(daysAgoLabel(ago(60 * 1000), now)).toBe("сегодня");
    expect(daysAgoLabel(ago(day), now)).toBe("вчера");
    expect(daysAgoLabel(ago(3 * day), now)).toBe("3 дня назад");
    expect(daysAgoLabel(ago(11 * day), now)).toBe("11 дней назад");
    expect(daysAgoLabel(ago(31 * day), now)).toBe("31 день назад");
  });

  it("часы клиента впереди сервера — «сегодня», а не отрицательные дни", () => {
    expect(daysAgoLabel(new Date(now.getTime() + day).toISOString(), now)).toBe(
      "сегодня",
    );
  });
});

describe("failureStreakLabel", () => {
  it("ноль отказов не показывается", () => {
    expect(failureStreakLabel(0)).toBeNull();
  });

  it("склоняет отказы", () => {
    expect(failureStreakLabel(1)).toBe("1 отказ подряд");
    expect(failureStreakLabel(3)).toBe("3 отказа подряд");
    expect(failureStreakLabel(7)).toBe("7 отказов подряд");
  });
});
