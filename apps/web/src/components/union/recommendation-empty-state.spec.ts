import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  countNarrowingFilters,
  emptyStateActions,
  EVERYTHING_URL,
  withIncludeSwiped,
} from "./recommendation-empty-state";

describe("countActiveFilters", () => {
  it("counts only filled filter keys", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ city: "Москва", radiusKm: "50" })).toBe(2);
  });

  it("ignores keys that are not filters", () => {
    expect(countActiveFilters({ page: "3", sort: "new" })).toBe(0);
  });

  it("counts a multi-value filter once", () => {
    expect(countActiveFilters({ intentions: ["family", "friendship"] })).toBe(1);
  });

  // Бейджу на мобильном includeSwiped — такая же непустая настройка, как
  // остальные: он считает отличия от умолчания, а не сужение выдачи.
  it("counts includeSwiped for the mobile badge", () => {
    expect(countActiveFilters({ includeSwiped: "true" })).toBe(1);
  });
});

describe("countNarrowingFilters", () => {
  // Риск: посчитать includeSwiped сужающим — тогда на пустом экране
  // предложат «сбросить фильтры», а сброс даст ещё меньше анкет.
  it("does not count includeSwiped, which widens the result", () => {
    expect(countNarrowingFilters({ includeSwiped: "true" })).toBe(0);
    expect(countNarrowingFilters({ includeSwiped: "true", city: "Москва" })).toBe(1);
  });
});

describe("emptyStateActions", () => {
  it("offers the hidden profiles with their exact count", () => {
    const actions = emptyStateActions({
      narrowingFilterCount: 0,
      includeSwiped: false,
      viewedMatchCount: 12,
    });
    expect(actions.viewedToShow).toBe(12);
    expect(actions.nothingHelps).toBe(false);
  });

  // Риск: предложить «показать отсмотренных», когда их и так показывают —
  // кнопка ведёт на ту же пустую выдачу и выглядит сломанной.
  it("does not offer viewed profiles when they are already shown", () => {
    expect(
      emptyStateActions({
        narrowingFilterCount: 0,
        includeSwiped: true,
        viewedMatchCount: 12,
      }).viewedToShow,
    ).toBeNull();
  });

  it("does not offer viewed profiles when history hides nobody", () => {
    expect(
      emptyStateActions({
        narrowingFilterCount: 1,
        includeSwiped: false,
        viewedMatchCount: 0,
      }).viewedToShow,
    ).toBeNull();
  });

  it("offers a filter reset only when a filter is set", () => {
    expect(
      emptyStateActions({
        narrowingFilterCount: 2,
        includeSwiped: false,
        viewedMatchCount: 0,
      }).canResetFilters,
    ).toBe(true);
    expect(
      emptyStateActions({
        narrowingFilterCount: 0,
        includeSwiped: false,
        viewedMatchCount: 0,
      }).canResetFilters,
    ).toBe(false);
  });

  it("admits that nothing helps when no action would change the result", () => {
    expect(
      emptyStateActions({
        narrowingFilterCount: 0,
        includeSwiped: true,
        viewedMatchCount: 0,
      }).nothingHelps,
    ).toBe(true);
  });
});

describe("withIncludeSwiped", () => {
  it("keeps the current filters and turns the flag on", () => {
    const url = new URL(
      withIncludeSwiped({ city: "Москва", radiusKm: "50" }),
      "https://example.test",
    );
    expect(url.searchParams.get("city")).toBe("Москва");
    expect(url.searchParams.get("radiusKm")).toBe("50");
    expect(url.searchParams.get("includeSwiped")).toBe("true");
  });

  it("returns to the first page: page 3 of the old result set may not exist", () => {
    expect(
      new URL(
        withIncludeSwiped({ page: "3" }),
        "https://example.test",
      ).searchParams.get("page"),
    ).toBe("1");
  });

  it("keeps every value of a multi-value filter", () => {
    expect(
      new URL(
        withIncludeSwiped({ intentions: ["family", "friendship"] }),
        "https://example.test",
      ).searchParams.getAll("intentions"),
    ).toEqual(["family", "friendship"]);
  });

  // Баннер про сброс истории относится к прошлому действию: утащить его в
  // новую ссылку — значит показать то же сообщение второй раз без причины.
  it("drops the one-off historyReset banner flag", () => {
    expect(
      new URL(
        withIncludeSwiped({ historyReset: "4" }),
        "https://example.test",
      ).searchParams.has("historyReset"),
    ).toBe(false);
  });
});

describe("EVERYTHING_URL", () => {
  // Сброс фильтров историю показов не снимает, а «показать отсмотренных»
  // сохраняет фильтры. Когда пусто из-за обоих сразу, ни та ни другая
  // кнопка до людей не доводит — нужен адрес, снимающий и то и другое.
  it("drops every filter and turns viewed profiles on", () => {
    const url = new URL(EVERYTHING_URL, "https://example.test");

    expect(url.pathname).toBe("/union/recommendations");
    expect(url.searchParams.get("includeSwiped")).toBe("true");
    expect([...url.searchParams.keys()]).toEqual(["includeSwiped"]);
  });
});
