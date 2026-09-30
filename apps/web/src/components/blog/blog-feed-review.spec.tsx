import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogPostDto } from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { BlogFeedReview } from "./blog-feed-review";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Мокаем транспорт, а не клиент блога: так проверяется и путь с телом
// запроса, и разбор кода ошибки в понятный текст.
vi.mock("@/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http-client")>()),
  apiFetch: vi.fn(),
}));

const ok = () => new Response(JSON.stringify({}), { status: 200 });

function reviewCall(): { url: string; body: unknown } {
  const [url, init] = vi.mocked(apiFetch).mock.calls[0] as [
    string,
    RequestInit,
  ];
  return { url, body: JSON.parse(String(init.body)) };
}

function makePost(id: string, title: string): BlogPostDto {
  return {
    id,
    author: { id: "u1", name: "Автор", avatarUrl: null },
    title,
    text: "Текст.",
    images: [],
    media: [],
    createdAt: "2026-09-21T12:00:00.000Z",
    editedAt: null,
    feedUntil: null,
    inFeed: false,
    pinned: false,
    repostCount: 0,
    repostOf: null,
    link: null,
    canEdit: false,
    canManage: false,
    canModerate: false,
    favorited: false,
    liked: false,
    likeCount: 0,
    feedStatus: "pending",
  } as BlogPostDto;
}

describe("BlogFeedReview", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("пустая очередь", () => {
    render(<BlogFeedReview initial={[]} />);
    expect(screen.getByText("Предложенных постов нет")).toBeInTheDocument();
  });

  it("«Одобрить» отправляет решение и убирает пост", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(ok());
    render(
      <BlogFeedReview
        initial={[makePost("a", "Первый"), makePost("b", "Второй")]}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Одобрить" })[0]);
    expect(reviewCall()).toEqual({
      url: expect.stringContaining("/blog/admin/posts/a/feed-review"),
      body: { decision: "approve" },
    });
    expect(await screen.findByText("Второй")).toBeInTheDocument();
    expect(screen.queryByText("Первый")).toBeNull();
  });

  it("«Отклонить» открывает поле, отказ уходит с пояснением", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(ok());
    render(<BlogFeedReview initial={[makePost("a", "Первый")]} />);
    await user.click(screen.getByRole("button", { name: "Отклонить" }));
    await user.type(screen.getByLabelText(/Пояснение автору/), "Не по теме");
    expect(screen.getByText("10 / 500")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отправить отказ" }));
    expect(reviewCall().body).toEqual({
      decision: "reject",
      note: "Не по теме",
    });
    expect(
      await screen.findByText("Предложенных постов нет"),
    ).toBeInTheDocument();
  });

  it("отказ без пояснения уходит без note; ошибка остаётся на месте", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "note_too_long" }), {
        status: 400,
      }),
    );
    render(<BlogFeedReview initial={[makePost("a", "Первый")]} />);
    await user.click(screen.getByRole("button", { name: "Отклонить" }));
    await user.click(screen.getByRole("button", { name: "Отправить отказ" }));
    expect(reviewCall().body).toEqual({ decision: "reject" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Пояснение длиннее 500 знаков.",
    );
    expect(screen.getByText("Первый")).toBeInTheDocument();
  });

  it("not_pending: пост уже решил другой админ — из очереди уходит", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "not_pending" }), {
        status: 409,
      }),
    );
    render(<BlogFeedReview initial={[makePost("a", "Первый")]} />);
    await user.click(screen.getByRole("button", { name: "Одобрить" }));
    expect(
      await screen.findByText("Предложенных постов нет"),
    ).toBeInTheDocument();
  });
});
