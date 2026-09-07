import { describe, expect, it } from "vitest";
import { LINEAGE_ALL } from "@vedamatch/shared";
import { lineageFromSelect, lineageToSelect } from "./lineage-picker";

/**
 * Значение `<select>` и значение API — не одно и то же, и на этом стыке
 * ломались все три формы Музыки: «для всех линий» в списке имеет значение
 * `"all"`, а API ждёт `null` и на строку `"all"` отвечает 400. Поэтому
 * преобразование — отдельная функция под тестом, а не выражение в обработчике.
 */
describe("значение выбора линии", () => {
  it("«для всех линий» уходит на сервер как null", () => {
    expect(lineageFromSelect(LINEAGE_ALL)).toBeNull();
  });

  it("пустой выбор — тоже null", () => {
    expect(lineageFromSelect("")).toBeNull();
  });

  it("выбранная линия уходит как есть", () => {
    expect(lineageFromSelect("iskcon")).toBe("iskcon");
  });

  it("null показывается как «для всех», а не как пустой выбор", () => {
    // Пустой выбор означал бы «ещё не решили», а решение принято.
    expect(lineageToSelect(null)).toBe(LINEAGE_ALL);
    expect(lineageToSelect(undefined)).toBe(LINEAGE_ALL);
  });

  it("линия показывается собой", () => {
    expect(lineageToSelect("gadadhara_parivara")).toBe("gadadhara_parivara");
  });

  it("туда и обратно ничего не теряет", () => {
    for (const value of [null, "iskcon", "ipbys"] as const) {
      expect(lineageFromSelect(lineageToSelect(value))).toBe(value);
    }
  });
});
