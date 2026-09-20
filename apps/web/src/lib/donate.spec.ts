import { describe, expect, it } from "vitest";
import {
  buildTransferPurpose,
  isBankFilled,
  isRequisiteFilled,
  MAX_TRANSFER_PURPOSE,
  splitBanks,
} from "./donate";
import {
  DONATE_BANKS,
  DONATE_PURPOSES,
  type DonateBank,
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
