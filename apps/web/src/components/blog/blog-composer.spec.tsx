import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlogPost } from "@/lib/blog-client-api";
import { BlogComposer } from "./blog-composer";

vi.mock("@/lib/blog-client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blog-client-api")>()),
  createBlogPost: vi.fn(),
}));

/* VED-590: «у каждого, кто добавляет пост, должна быть кнопка — Назначить
   категорию». */
describe("BlogComposer: категория", () => {
  it("уходит вместе с постом", async () => {
    const user = userEvent.setup();
    vi.mocked(createBlogPost).mockResolvedValue({
      post: { id: "p" } as never,
      failed: [],
    });
    render(<BlogComposer />);

    await user.type(screen.getByLabelText("Текст поста"), "Экадаши в среду");
    await user.selectOptions(screen.getByLabelText("Категория"), "Календарь");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(createBlogPost).toHaveBeenCalledWith(
      { title: "", text: "Экадаши в среду", category: "calendar" },
      [],
    );
    // После публикации форма чистая — и категория тоже.
    expect(screen.getByLabelText("Категория")).toHaveValue("");
  });

  it("без выбора — без категории", async () => {
    const user = userEvent.setup();
    vi.mocked(createBlogPost).mockClear();
    vi.mocked(createBlogPost).mockResolvedValue({
      post: { id: "p" } as never,
      failed: [],
    });
    render(<BlogComposer />);

    await user.type(screen.getByLabelText("Текст поста"), "Просто пост");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(createBlogPost).toHaveBeenCalledWith(
      { title: "", text: "Просто пост", category: null },
      [],
    );
  });
});
