import { describe, expect, it } from "vitest";
import { statsCallToAction } from "./stats-call-to-action";

describe("statsCallToAction", () => {
  it("без имени зовёт посмотреть статистику", () => {
    expect(statsCallToAction()).toBe("Посмотреть, как мы растём");
  });

  it("с именем обращается лично", () => {
    expect(statsCallToAction("Кешава")).toBe(
      "Кешава, посмотрите, как мы растём",
    );
  });

  it("пустое имя не даёт обращения из запятой", () => {
    expect(statsCallToAction("   ")).toBe("Посмотреть, как мы растём");
  });

  it("обрезает пробелы вокруг имени", () => {
    expect(statsCallToAction("  Сита  ")).toBe(
      "Сита, посмотрите, как мы растём",
    );
  });
});
