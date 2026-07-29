import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibrarySectionDto } from "@vedamatch/shared";
import { SectionStrip } from "./section-strip";

function section(
  slug: string,
  titleRu: string,
  titleEn: string,
): LibrarySectionDto {
  return {
    id: `id-${slug}`,
    slug,
    titleRu,
    titleEn,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 1,
    categoriesCount: 0,
    entriesCount: 0,
  };
}

const sections = [
  section("philosophy", "Философия и писания", "Philosophy and scriptures"),
  section("practice", "Практика и садхана", "Practice and sadhana"),
];

describe("SectionStrip", () => {
  it("shows every section at once instead of hiding them behind a scroller", () => {
    const { container } = render(
      <SectionStrip sections={sections} locale="ru" />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("grid");
    expect(nav?.className).not.toContain("overflow-x-auto");
  });

  it("marks the active section for assistive technology", () => {
    render(
      <SectionStrip sections={sections} locale="ru" activeSlug="practice" />,
    );

    expect(
      screen.getByRole("link", { name: /Практика и садхана/ }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: /Философия и писания/ })
        .getAttribute("aria-current"),
    ).toBeNull();
  });
});
