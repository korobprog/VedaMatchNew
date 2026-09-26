import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BlogPostDto } from "@vedamatch/shared";
import { BlogPostView } from "./blog-post-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function makePost(overrides: Partial<BlogPostDto> = {}): BlogPostDto {
  return {
    id: "post-1",
    author: { id: "u1", name: "Бхавани Даяни", avatarUrl: null },
    title: "Праздник в храме",
    text: "Приходите в субботу к шести.",
    images: [],
    media: [],
    createdAt: "2026-09-21T12:00:00.000Z",
    editedAt: null,
    feedUntil: null,
    inFeed: true,
    pinned: false,
    repostCount: 0,
    repostOf: null,
    link: null,
    canEdit: false,
    canManage: false,
    canModerate: false,
    favorited: false,
    ...overrides,
  } as BlogPostDto;
}

/* VED-495: «Рядом с кнопкой Поделиться сделай кнопку Редактировать…
   Пусть будет и сверху и снизу». */
describe("BlogPostView", () => {
  it("«Редактировать» сверху открывает правку поста", async () => {
    const user = userEvent.setup();
    render(<BlogPostView initial={makePost({ canEdit: true })} />);

    const top = screen.getAllByRole("button", {
      name: /Редактировать|Изменить/,
    });
    expect(top.length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("button", { name: "Редактировать" }));

    expect(
      screen.getByRole("form", { name: "Правка поста" }),
    ).toBeInTheDocument();
  });

  it("чужой пост без права правки — без кнопки сверху", () => {
    render(<BlogPostView initial={makePost()} />);
    expect(
      screen.queryByRole("button", { name: "Редактировать" }),
    ).not.toBeInTheDocument();
  });
});
