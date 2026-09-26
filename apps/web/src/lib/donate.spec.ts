import { describe, expect, it } from "vitest";
import { buildTransferPurpose, MAX_TRANSFER_PURPOSE } from "./donate";
import {
  DONATE_EXPENSES,
  DONATE_PURPOSES,
  DONATE_RECIPIENTS,
} from "./donate-content";

describe("buildTransferPurpose", () => {
  it("собирает цель и подпись в одну строку", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Дар на развитие и поддержку Портала VedaMatch",
        donorName: "Кришна дас",
      }),
    ).toBe("Дар на развитие и поддержку Портала VedaMatch. От: Кришна дас");
  });

  it("ФИО и духовное имя — через скобки", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Благодарность разработчикам Портала VedaMatch",
        donorName: "Иванов Иван Иванович",
        spiritualName: "Кришна дас",
      }),
    ).toBe(
      "Благодарность разработчикам Портала VedaMatch. От: Иванов Иван Иванович (Кришна дас)",
    );
  });

  it("только духовное имя — без пустых скобок", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Дар на развитие и поддержку Портала VedaMatch",
        donorName: "  ",
        spiritualName: "Кришна дас",
      }),
    ).toBe("Дар на развитие и поддержку Портала VedaMatch. От: Кришна дас");
  });

  it("только ФИО — без скобок", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Дар на развитие и поддержку Портала VedaMatch",
        donorName: "Иванов Иван Иванович",
        spiritualName: "",
      }),
    ).toBe("Дар на развитие и поддержку Портала VedaMatch. От: Иванов Иван Иванович");
  });

  it("без подписи оставляет только цель", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Благодарность разработчикам Портала VedaMatch",
      }),
    ).toBe("Благодарность разработчикам Портала VedaMatch");
  });

  it("берёт формулировку как есть, без приклеенного «Дар»", () => {
    // Склейка ломалась о падежи: получалось «Дар на благодарность разработчикам».
    expect(
      buildTransferPurpose({ purposeText: "Благодарность разработчикам" }),
    ).toBe("Благодарность разработчикам");
  });

  it("подставляет общую формулировку, когда цель не выбрали", () => {
    expect(buildTransferPurpose({ purposeText: "  ", donorName: null })).toBe(
      "Дар на развитие и поддержку Портала VedaMatch",
    );
  });

  it("схлопывает переводы строк и двойные пробелы", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Дар  на разработку\nи поддержку",
        donorName: " Гопал \n дас ",
      }),
    ).toBe("Дар на разработку и поддержку. От: Гопал дас");
  });

  it("вычищает кавычки и служебные знаки, на которых спотыкаются платёжки", () => {
    expect(
      buildTransferPurpose({
        purposeText: "Дар на «разработку» портала",
        donorName: 'Иван "Ваня" #1',
      }),
    ).toBe("Дар на разработку портала. От: Иван Ваня 1");
  });

  it("обрезает длинную подпись по границе слова", () => {
    const result = buildTransferPurpose({
      purposeText: "Дар на развитие и поддержку Портала VedaMatch",
      donorName: "Абвгдеж ".repeat(40),
    });

    expect(result.length).toBeLessThanOrEqual(MAX_TRANSFER_PURPOSE);
    // Полуслова в выписке читаются как опечатка: строка кончается словом.
    expect(result).not.toMatch(/\s$/);
    expect(result.endsWith("Абвгдеж")).toBe(true);
  });

  it("работает на каждой цели из справочника", () => {
    for (const purpose of DONATE_PURPOSES) {
      const result = buildTransferPurpose({ purposeText: purpose.transfer });
      // Формулировка доезжает до выписки целиком: ни обрезки, ни чистки.
      expect(result).toBe(purpose.transfer);
      expect(result.length).toBeLessThanOrEqual(MAX_TRANSFER_PURPOSE);
    }
  });

  it("оставляет место под подпись даже с самой длинной целью", () => {
    for (const purpose of DONATE_PURPOSES) {
      const result = buildTransferPurpose({
        purposeText: purpose.transfer,
        donorName: "Коробков Максим Сергеевич",
        spiritualName: "Маму Тхакур дас",
      });

      expect(result.endsWith("От: Коробков Максим Сергеевич (Маму Тхакур дас)")).toBe(true);
      expect(result.length).toBeLessThanOrEqual(MAX_TRANSFER_PURPOSE);
    }
  });
});

describe("DONATE_EXPENSES", () => {
  it("пять статей в формулировках заказчика", () => {
    // VED-12, текст заказчика от 21.09 в описании карточки.
    expect(DONATE_EXPENSES.map((item) => item.title)).toEqual([
      "Серверы и база данных",
      "Хранилище и трафик",
      "Расходы на ИИ",
      "Домены и сертификаты",
      "Другие расходы",
    ]);
  });
});

describe("DONATE_RECIPIENTS", () => {
  it("Станислав первым, оба с подписью заказчика", () => {
    expect(DONATE_RECIPIENTS.map((item) => item.name)).toEqual([
      "Станислав Юрьев (Санкаршан д.)",
      "Максим Коробков (Маму Тхакур д.)",
    ]);
  });
});

describe("DONATE_PURPOSES", () => {
  it("ровно две цели, первая — на портал", () => {
    // Третий круг VED-12: заказчик вычеркнул прежний список из пяти вариантов
    // и назвал две формулировки. Новый пункт здесь — только с его слов.
    expect(DONATE_PURPOSES).toHaveLength(2);
    expect(DONATE_PURPOSES[0].label).toBe(
      "На развитие и поддержку Портала VedaMatch",
    );
    expect(DONATE_PURPOSES[1].label).toBe("Благодарность разработчикам");
  });
});
