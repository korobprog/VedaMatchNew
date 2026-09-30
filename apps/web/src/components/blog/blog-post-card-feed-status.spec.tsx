import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogPostDto } from "@vedamatch/shared";
import {
  requestBlogFeed,
  withdrawBlogFeedRequest,
} from "@/lib/blog-client-api";
import { BlogPostCard } from "./blog-post-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/blog-client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blog-client-api")>()),
  requestBlogFeed: vi.fn(),
  withdrawBlogFeedRequest: vi.fn(),
}));

function makePost(overrides: Partial<BlogPostDto> = {}): BlogPostDto {
  return {
    id: "post-1",
    author: { id: "u1", name: "Бхавани Даяни", avatarUrl: null },
    title: "Заметка",
    text: "Текст заметки.",
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
    canEdit: true,
    canManage: true,
    canModerate: false,
    favorited: false,
    ...overrides,
  } as BlogPostDto;
}

// VED-686: статус «в общую ленту» виден автору на личной странице.
describe("BlogPostCard: статус в общей ленте", () => {
  beforeEach(() => {
    vi.mocked(requestBlogFeed).mockReset();
    vi.mocked(withdrawBlogFeedRequest).mockReset();
  });

  it("personal: плашка и «Предложить в общую ленту» обновляют пост из ответа", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const updated = makePost({ feedStatus: "pending" });
    vi.mocked(requestBlogFeed).mockResolvedValue(updated);
    render(
      <BlogPostCard
        post={makePost({ feedStatus: "personal" })}
        showFeedStatus
        onChanged={onChanged}
      />,
    );
    expect(screen.getByText("Только на вашей странице")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Предложить в общую ленту" }),
    );
    expect(requestBlogFeed).toHaveBeenCalledWith("post-1");
    expect(onChanged).toHaveBeenCalledWith(updated);
  });

  it("pending: «На проверке» и «Отозвать»", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const updated = makePost({ feedStatus: "personal" });
    vi.mocked(withdrawBlogFeedRequest).mockResolvedValue(updated);
    render(
      <BlogPostCard
        post={makePost({ feedStatus: "pending" })}
        showFeedStatus
        onChanged={onChanged}
      />,
    );
    expect(
      screen.getByText("На проверке у администратора"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отозвать" }));
    expect(withdrawBlogFeedRequest).toHaveBeenCalledWith("post-1");
    expect(onChanged).toHaveBeenCalledWith(updated);
  });

  it("rejected: плашка, пояснение и «Предложить снова»", async () => {
    const user = userEvent.setup();
    vi.mocked(requestBlogFeed).mockResolvedValue(
      makePost({ feedStatus: "pending" }),
    );
    render(
      <BlogPostCard
        post={makePost({
          feedStatus: "rejected",
          feedReviewNote: "Не по теме",
        })}
        showFeedStatus
      />,
    );
    expect(screen.getByText("Не принят в ленту")).toBeInTheDocument();
    expect(screen.getByText("Не по теме")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Предложить снова" }));
    expect(requestBlogFeed).toHaveBeenCalledWith("post-1");
  });

  it("не показывается в общей ленте, у чужого поста, у feed и у репоста", () => {
    const { rerender } = render(
      <BlogPostCard post={makePost({ feedStatus: "personal" })} />,
    );
    expect(screen.queryByText("Только на вашей странице")).toBeNull();

    rerender(
      <BlogPostCard
        post={makePost({ feedStatus: "personal", canEdit: false })}
        showFeedStatus
      />,
    );
    expect(screen.queryByText("Только на вашей странице")).toBeNull();

    rerender(
      <BlogPostCard post={makePost({ feedStatus: "feed" })} showFeedStatus />,
    );
    expect(screen.queryByRole("button", { name: /Предложить/ })).toBeNull();

    rerender(
      <BlogPostCard
        post={makePost({
          feedStatus: "personal",
          repostOf: {
            id: "s",
            author: { id: "u2", name: "Другой", avatarUrl: null },
            title: "",
            text: "x",
            images: [],
            media: [],
            link: null,
          } as never,
        })}
        showFeedStatus
      />,
    );
    expect(screen.queryByText("Только на вашей странице")).toBeNull();
  });
});
