import { describe, expect, it } from "vitest";
import {
  cashHotkey,
  DEFAULT_CASH_PANEL,
  parseCashPanel,
  toggleCashPanelButton,
  type CashPanelSettings,
} from "./cash-panel";

describe("parseCashPanel", () => {
  it("пусто или мусор — значения по умолчанию", () => {
    expect(parseCashPanel(null)).toEqual(DEFAULT_CASH_PANEL);
    expect(parseCashPanel("{не json")).toEqual(DEFAULT_CASH_PANEL);
  });

  it("читает положение и набор, порядок — канонический", () => {
    expect(
      parseCashPanel(
        JSON.stringify({
          position: "bottom",
          buttons: ["stats", "add-income"],
        }),
      ),
    ).toEqual({ position: "bottom", buttons: ["add-income", "stats"] });
  });

  it("неизвестные кнопки отбрасываются, пустой набор не принимается", () => {
    expect(
      parseCashPanel(JSON.stringify({ position: "left", buttons: ["x"] })),
    ).toEqual(DEFAULT_CASH_PANEL);
  });
});

describe("toggleCashPanelButton", () => {
  it("выключает и включает, сохраняя канонический порядок", () => {
    const base: CashPanelSettings = {
      position: "top",
      buttons: ["add-income", "stats"],
    };
    const off = toggleCashPanelButton(base, "stats");
    expect(off.buttons).toEqual(["add-income"]);
    const on = toggleCashPanelButton(off, "add-expense");
    expect(on.buttons).toEqual(["add-income", "add-expense"]);
  });

  it("последнюю кнопку выключить нельзя", () => {
    const one: CashPanelSettings = { position: "top", buttons: ["stats"] };
    expect(toggleCashPanelButton(one, "stats")).toBe(one);
  });
});

describe("cashHotkey", () => {
  const key = (
    value: string,
    extra: Partial<Parameters<typeof cashHotkey>[0]> = {},
  ) =>
    cashHotkey({
      key: value,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      editing: false,
      dialogOpen: false,
      ...extra,
    });

  it("плюс — доход, минус — расход, слэш — фильтр, S и Ы — статистика", () => {
    expect(key("+")).toBe("income");
    expect(key("=")).toBe("income");
    expect(key("-")).toBe("expense");
    expect(key("/")).toBe("filter");
    expect(key("s")).toBe("stats");
    expect(key("Ы")).toBe("stats");
  });

  it("молчит при наборе в поле, в открытом диалоге и с модификаторами", () => {
    expect(key("+", { editing: true })).toBeNull();
    expect(key("+", { dialogOpen: true })).toBeNull();
    expect(key("+", { ctrlKey: true })).toBeNull();
    expect(key("-", { metaKey: true })).toBeNull();
  });

  it("прочие клавиши — ничего", () => {
    expect(key("a")).toBeNull();
    expect(key("Enter")).toBeNull();
  });
});
