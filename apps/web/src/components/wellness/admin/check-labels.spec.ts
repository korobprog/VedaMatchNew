import { describe, expect, it } from "vitest";
import {
  checkCostLabel,
  checkReasonLabel,
  checkStatusLabel,
  proposedChange,
  sourceLevelLabel,
} from "./check-labels";

describe("подписи автопроверки", () => {
  it("статус и причина — словами, а не кодом", () => {
    expect(checkStatusLabel("review")).toBe("Передана модератору");
    expect(checkReasonLabel("not_found")).toBe(
      "ИИ не нашёл товар в открытых источниках",
    );
  });

  it("незнакомая причина из новой версии сервера не теряется", () => {
    expect(checkReasonLabel("new_reason")).toBe("new_reason");
  });

  it("уровень источника объясняет, кто его видел", () => {
    expect(sourceLevelLabel("claimed")).toBe("только со слов ИИ");
    expect(sourceLevelLabel("verified")).toContain("штрихкод");
  });
});

describe("checkCostLabel", () => {
  it("цены не заданы — стоимость не показываем", () => {
    expect(checkCostLabel(0)).toBeNull();
    expect(checkCostLabel(Number.NaN)).toBeNull();
  });

  it("доли цента и центы", () => {
    expect(checkCostLabel(0.004)).toBe("меньше цента");
    expect(checkCostLabel(0.109225)).toBe("10.9 ¢");
  });
});

describe("proposedChange", () => {
  it("совпадение с точностью до регистра и пробелов — не изменение", () => {
    expect(proposedChange("Nutella  паста", "nutella паста")).toBeNull();
  });

  it("ИИ ничего не предложил — не изменение", () => {
    expect(proposedChange("Nutella", null)).toBeNull();
    expect(proposedChange("Nutella", "  ")).toBeNull();
  });

  it("новое значение показывается как есть", () => {
    expect(proposedChange(null, "Ferrero")).toBe("Ferrero");
    expect(proposedChange("Нутелла", "Nutella паста ореховая")).toBe(
      "Nutella паста ореховая",
    );
  });
});
