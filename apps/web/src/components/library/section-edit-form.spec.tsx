import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibrarySectionDto } from "@vedamatch/shared";
import { SectionEditForm } from "./section-edit-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const section: LibrarySectionDto = {
  id: "id-philosophy",
  slug: "philosophy",
  titleRu: "Философия и писания",
  titleEn: "Philosophy and scriptures",
  descriptionRu: null,
  descriptionEn: null,
  iconKey: null,
  position: 1,
  categoriesCount: 0,
  entriesCount: 2,
  canEdit: true,
};

describe("SectionEditForm", () => {
  it("uses an opaque background so text stays readable over other cards", () => {
    render(<SectionEditForm locale="ru" section={section} />);

    fireEvent.click(screen.getByLabelText(/редактировать/i));

    const form = screen.getByText(/редактировать раздел/i).closest("form");
    const classes = form?.className.split(/\s+/) ?? [];
    expect(classes).toContain("bg-bg-1");
    // "glass" is the translucent utility that made the popover unreadable
    // over overlapping cards — "border-glass-brd" is an unrelated border
    // color token and should stay.
    expect(classes).not.toContain("glass");
  });
});
