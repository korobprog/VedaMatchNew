import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminAnnouncementDto } from "@vedamatch/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AdminChangelogAnnouncements } from "./admin-changelog-announcements";

const news: AdminAnnouncementDto = {
  id: "a1",
  titleRu: "Медиатека и другое",
  titleEn: "Media library and more",
  bodyRu: "Текст",
  bodyEn: "Text",
  status: "published",
  publishedAt: "2026-09-01T00:00:00.000Z",
  pinned: false,
  publishAt: null,
  expiresAt: null,
  broadcastAt: null,
  broadcastCount: 0,
  acknowledgedCount: 3,
};

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// VED-136: поля новой новости — наверху, а не под всем списком.
describe("AdminChangelogAnnouncements", () => {
  it("ставит «Добавить новость» над списком новостей", () => {
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    const add = screen.getByRole("button", { name: "Добавить новость" });
    expect(before(add, screen.getByText("Медиатека и другое"))).toBe(true);
  });

  it("открытая форма тоже над списком", async () => {
    render(<AdminChangelogAnnouncements announcements={[news]} />);

    await userEvent.click(screen.getByRole("button", { name: "Добавить новость" }));

    const title = screen.getByPlaceholderText("Заголовок (RU)");
    expect(before(title, screen.getByText("Медиатека и другое"))).toBe(true);
  });

  it("по ссылке «Добавить новость» из шапки форма открыта сразу и стоит первой", () => {
    render(<AdminChangelogAnnouncements announcements={[news]} startCreating />);

    const title = screen.getByPlaceholderText("Заголовок (RU)");
    expect(before(title, screen.getByText("Медиатека и другое"))).toBe(true);
  });
});
