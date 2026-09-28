import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BlogPostDto } from "@vedamatch/shared";
import { setBlogPostCategory, setBlogPostLineage } from "@/lib/blog-client-api";
import { BlogPostView } from "./blog-post-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/blog-client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blog-client-api")>()),
  setBlogPostLineage: vi.fn(),
  setBlogPostCategory: vi.fn(),
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

/* VED-544: «Убери две кнопки отмеченные галочкой из меню всех участников
   кроме админов» — «Репост» и «Закрепить». */
describe("ряд действий поста: только для админов", () => {
  it("участник не видит ни «Репост», ни «Закрепить»", () => {
    render(<BlogPostView initial={makePost()} />);
    expect(screen.queryByRole("button", { name: "Репост" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Закрепить" })).toBeNull();
  });

  it("админ видит обе", () => {
    render(<BlogPostView initial={makePost({ canModerate: true })} />);
    expect(screen.getByRole("button", { name: "Репост" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрепить" }),
    ).toBeInTheDocument();
  });
});

/* VED-596: «в меню кнопок поста значок „Линия“, только для админов». */
describe("«Линия» поста", () => {
  it("участник значка не видит", () => {
    render(<BlogPostView initial={makePost()} />);
    expect(screen.queryByRole("button", { name: /^Линия:/ })).toBeNull();
  });

  it("админ назначает линию, и значок показывает её", async () => {
    const user = userEvent.setup();
    vi.mocked(setBlogPostLineage).mockResolvedValue(
      makePost({ canModerate: true, lineage: "iskcon" }),
    );
    render(<BlogPostView initial={makePost({ canModerate: true })} />);

    await user.click(
      screen.getByRole("button", { name: "Линия: для всех линий" }),
    );
    await user.click(screen.getByRole("button", { name: "ISKCON" }));

    expect(setBlogPostLineage).toHaveBeenCalledWith("post-1", "iskcon");
    expect(
      screen.getByRole("button", { name: "Линия: ISKCON" }),
    ).toBeInTheDocument();
  });
});

/* VED-590: «Сократи кнопку-надпись Поделиться до кнопки-значка»; «у каждого,
   кто добавляет пост, должна быть кнопка — Назначить категорию». */
describe("ряд кнопок над постом (VED-590)", () => {
  it("«Поделиться» — значок без подписи на экране, с именем для скринридера", () => {
    render(<BlogPostView initial={makePost()} />);
    const share = screen.getByRole("button", { name: "Поделиться" });
    expect(share).toHaveTextContent("");
    expect(share).toHaveAttribute("title", "Поделиться");
  });

  it("чужой пост — без «Назначить категорию»", () => {
    render(<BlogPostView initial={makePost()} />);
    expect(
      screen.queryByRole("button", { name: /^Назначить категорию/ }),
    ).toBeNull();
  });

  it("автор назначает категорию, и она видна в строке даты", async () => {
    const user = userEvent.setup();
    vi.mocked(setBlogPostCategory).mockResolvedValue(
      makePost({ canEdit: true, category: "news" }),
    );
    render(<BlogPostView initial={makePost({ canEdit: true })} />);

    await user.click(
      screen.getByRole("button", {
        name: "Назначить категорию: без категории",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Новости" }));

    expect(setBlogPostCategory).toHaveBeenCalledWith("post-1", "news");
    expect(
      screen.getByRole("button", { name: "Назначить категорию: Новости" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/· Новости/)).toBeInTheDocument();
  });
});

/* VED-442: «Сделай в ряде этих кнопок клавишу-значок Поделиться (в
   мессенджеры и т.д.)» — в ряду под постом, у всех, не только у админов. */
describe("«Поделиться» в ряду кнопок под постом (VED-442)", () => {
  it("кнопка есть у участника и отдаёт ссылку на пост системному окну", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    try {
      render(<BlogPostView initial={makePost()} />);
      const button = screen.getByRole("button", { name: "Поделиться постом" });
      expect(button.closest("footer")).not.toBeNull();
      await user.click(button);
      expect(share).toHaveBeenCalledWith({
        title: "Праздник в храме",
        url: `${window.location.origin}/blog/posts/post-1`,
      });
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it("у админа «Поделиться» стоит перед «Репостом»", () => {
    render(<BlogPostView initial={makePost({ canModerate: true })} />);
    const footer = screen
      .getByRole("button", { name: "Поделиться постом" })
      .closest("footer")!;
    const names = [...footer.querySelectorAll("button")].map(
      (node) => node.textContent,
    );
    expect(names.indexOf("Поделиться постом")).toBe(
      names.indexOf("Репост") - 1,
    );
  });
});
