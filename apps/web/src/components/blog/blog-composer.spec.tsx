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
   категорию»; «сделай, чтобы пост невозможно было опубликовать, не назначив
   линию и категорию». */
describe("BlogComposer: категория и линия", () => {
  it("без категории и линии «Опубликовать» неактивна и сказано почему", async () => {
    const user = userEvent.setup();
    render(<BlogComposer />);
    await user.type(screen.getByLabelText("Текст поста"), "Просто пост");

    const publish = screen.getByRole("button", { name: "Опубликовать" });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      "Чтобы опубликовать пост, выберите категорию и линию (или «Для всех»).",
    );

    await user.selectOptions(screen.getByLabelText("Категория"), "Новости");
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      "Чтобы опубликовать пост, выберите линию (или «Для всех»).",
    );
  });

  it("категория и «Для всех» уходят вместе с постом", async () => {
    const user = userEvent.setup();
    vi.mocked(createBlogPost).mockClear();
    vi.mocked(createBlogPost).mockResolvedValue({
      post: { id: "p" } as never,
      failed: [],
    });
    render(<BlogComposer />);

    await user.type(screen.getByLabelText("Текст поста"), "Экадаши в среду");
    await user.selectOptions(screen.getByLabelText("Категория"), "Календарь");
    await user.selectOptions(screen.getByLabelText("Линия"), "Для всех");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(createBlogPost).toHaveBeenCalledWith(
      {
        title: "",
        text: "Экадаши в среду",
        category: "calendar",
        lineage: "all",
      },
      [],
    );
    // После публикации форма чистая — и категория, и линия тоже.
    expect(screen.getByLabelText("Категория")).toHaveValue("");
    expect(screen.getByLabelText("Линия")).toHaveValue("");
  });

  it("линия выбирается в два шага: группа, затем какой именно матх", async () => {
    const user = userEvent.setup();
    vi.mocked(createBlogPost).mockClear();
    vi.mocked(createBlogPost).mockResolvedValue({
      post: { id: "p" } as never,
      failed: [],
    });
    render(<BlogComposer />);

    await user.type(screen.getByLabelText("Текст поста"), "Лекция");
    await user.selectOptions(screen.getByLabelText("Категория"), "Знания");
    await user.selectOptions(screen.getByLabelText("Линия"), "Гаудия-матх");
    // Группа целиком — ещё не выбор: кнопка ждёт второго шага.
    expect(screen.getByRole("button", { name: "Опубликовать" })).toBeDisabled();

    const detail = screen.getByRole("combobox", { name: /^Линия: / });
    await user.selectOptions(detail, "ipbys");
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(createBlogPost).toHaveBeenCalledWith(
      expect.objectContaining({ category: "knowledge", lineage: "ipbys" }),
      [],
    );
  });
});
