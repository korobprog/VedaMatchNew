import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { unionProfileFieldLabels } from "./dictionaries";
import { COMPLETENESS_ICON_KEYS, CompletenessIcon } from "./completeness-icons";

describe("CompletenessIcon", () => {
  it("у каждого поля анкеты есть свой значок, и он рисуется", () => {
    const fields = Object.keys(unionProfileFieldLabels);
    expect([...COMPLETENESS_ICON_KEYS].sort()).toEqual([...fields].sort());
    for (const key of COMPLETENESS_ICON_KEYS) {
      const { container, unmount } = render(<CompletenessIcon field={key} />);
      expect(container.querySelector("svg path")?.getAttribute("d")).toMatch(/^M/);
      unmount();
    }
  });
});
