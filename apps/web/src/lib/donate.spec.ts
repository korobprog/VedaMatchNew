import { describe, expect, it } from "vitest";
import { buildTransferPurpose, MAX_TRANSFER_PURPOSE } from "./donate";
import { DONATE_PURPOSES } from "./donate-content";

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
