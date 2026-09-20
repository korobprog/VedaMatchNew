import { describe, expect, it } from "vitest";
import {
  buildExpenseBreakdown,
  buildTransferPurpose,
  formatRub,
  isBankFilled,
  isRequisiteFilled,
  MAX_TRANSFER_PURPOSE,
  splitBanks,
} from "./donate";
import {
  DONATE_BANKS,
  DONATE_EXPENSES,
  DONATE_PURPOSES,
  type DonateBank,
  type DonateExpense,
} from "./donate-content";

describe("buildTransferPurpose", () => {
  it("собирает цель и подпись в одну строку", () => {
    expect(
      buildTransferPurpose({
        purposeLabel: "На развитие портала",
        donorName: "Кришна дас",
      }),
    ).toBe("Дар на развитие портала. От: Кришна дас");
  });

  it("без подписи оставляет только цель", () => {
    expect(buildTransferPurpose({ purposeLabel: "На серверы" })).toBe(
      "Дар на серверы",
    );
  });

  it("подставляет общую формулировку, когда цель не выбрали", () => {
    expect(buildTransferPurpose({ purposeLabel: "  ", donorName: null })).toBe(
      "Дар на развитие VedaMatch",
    );
  });

  it("схлопывает переводы строк и двойные пробелы", () => {
    expect(
      buildTransferPurpose({
        purposeLabel: "На  серверы\nи хранилище",
        donorName: " Гопал \n дас ",
      }),
    ).toBe("Дар на серверы и хранилище. От: Гопал дас");
  });

  it("вычищает кавычки и служебные знаки, на которых спотыкаются платёжки", () => {
    expect(
      buildTransferPurpose({
        purposeLabel: "На «развитие» портала",
        donorName: 'Иван "Ваня" #1',
      }),
    ).toBe("Дар на развитие портала. От: Иван Ваня 1");
  });

  it("обрезает длинную подпись по границе слова", () => {
    const result = buildTransferPurpose({
      purposeLabel: "На развитие портала",
      donorName: "Абвгдеж ".repeat(40),
    });

    expect(result.length).toBeLessThanOrEqual(MAX_TRANSFER_PURPOSE);
    // Полуслова в выписке читаются как опечатка: строка кончается словом.
    expect(result).not.toMatch(/\s$/);
    expect(result.endsWith("Абвгдеж")).toBe(true);
  });

  it("работает на каждой цели из справочника", () => {
    for (const purpose of DONATE_PURPOSES) {
      const result = buildTransferPurpose({ purposeLabel: purpose.label });
      expect(result.startsWith("Дар ")).toBe(true);
      expect(result.length).toBeLessThanOrEqual(MAX_TRANSFER_PURPOSE);
    }
  });
});

describe("реквизиты банков", () => {
  const bank = (lines: DonateBank["lines"]): DonateBank => ({
    id: "x",
    name: "Банк",
    note: "",
    lines,
  });

  it("пустое значение не считается заполненным", () => {
    expect(isRequisiteFilled({ label: "Счёт", value: null })).toBe(false);
    expect(isRequisiteFilled({ label: "Счёт", value: "   " })).toBe(false);
    expect(isRequisiteFilled({ label: "Счёт", value: "40817" })).toBe(true);
  });

  it("банк готов, когда заполнена хотя бы одна строка", () => {
    expect(isBankFilled(bank([{ label: "Счёт", value: null }]))).toBe(false);
    expect(
      isBankFilled(
        bank([
          { label: "Счёт", value: null },
          { label: "БИК", value: "044525225" },
        ]),
      ),
    ).toBe(true);
  });

  it("делит список на готовые и ожидающие данных", () => {
    const ready = bank([{ label: "Счёт", value: "1" }]);
    const waiting = bank([{ label: "Счёт", value: null }]);

    expect(splitBanks([ready, waiting])).toEqual({
      filled: [ready],
      pending: [waiting],
    });
  });

  // Пока реквизитов не дали, страница не имеет права рисовать цифры.
  it("сегодня в справочнике нет ни одного заполненного банка", () => {
    expect(splitBanks(DONATE_BANKS).filled).toEqual([]);
    expect(splitBanks(DONATE_BANKS).pending).toHaveLength(DONATE_BANKS.length);
  });
});

describe("buildExpenseBreakdown", () => {
  const expenses: DonateExpense[] = [
    { id: "a", title: "Серверы", amountRub: 6000, note: "" },
    { id: "b", title: "Хранилище", amountRub: 2000, note: "" },
    { id: "c", title: "Домены", amountRub: null, note: "" },
  ];

  it("считает сумму, доли и число статей без суммы", () => {
    const result = buildExpenseBreakdown(expenses);

    expect(result.total).toBe(8000);
    expect(result.hasAmounts).toBe(true);
    expect(result.unknownCount).toBe(1);
    expect(result.rows.map((row) => row.share)).toEqual([75, 25, null]);
  });

  it("сохраняет порядок и поля статей", () => {
    const result = buildExpenseBreakdown(expenses);

    expect(result.rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(result.rows[0]).toMatchObject({ title: "Серверы", amountRub: 6000 });
  });

  it("округляет доли до десятой процента", () => {
    const result = buildExpenseBreakdown([
      { id: "a", title: "A", amountRub: 1, note: "" },
      { id: "b", title: "B", amountRub: 2, note: "" },
    ]);

    expect(result.rows.map((row) => row.share)).toEqual([33.3, 66.7]);
  });

  it("не делит на ноль и не выдумывает доли, когда сумм нет", () => {
    const result = buildExpenseBreakdown([
      { id: "a", title: "A", amountRub: null, note: "" },
      { id: "b", title: "B", amountRub: 0, note: "" },
    ]);

    expect(result).toMatchObject({ total: 0, hasAmounts: false, unknownCount: 2 });
    expect(result.rows.every((row) => row.share === null)).toBe(true);
  });

  it("пустой список не роняет расчёт", () => {
    expect(buildExpenseBreakdown([])).toEqual({
      rows: [],
      total: 0,
      unknownCount: 0,
      hasAmounts: false,
    });
  });

  // Суммы в справочнике ещё не заполнены — блок обязан это показывать честно.
  it("сегодня смета портала без сумм", () => {
    const result = buildExpenseBreakdown(DONATE_EXPENSES);

    expect(result.hasAmounts).toBe(false);
    expect(result.unknownCount).toBe(DONATE_EXPENSES.length);
  });
});

describe("formatRub", () => {
  it("пишет рубли по-русски и без копеек", () => {
    // Разделитель разрядов у Intl — узкий неразрывный пробел.
    expect(formatRub(12400).replace(/\s/g, " ")).toBe("12 400 ₽");
    expect(formatRub(999.6).replace(/\s/g, " ")).toBe("1 000 ₽");
  });
});
