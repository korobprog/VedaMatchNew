import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BlogAuthorAbout } from "./blog-author-about";

const updateBlogAbout = vi.fn();
vi.mock("@/lib/blog-client-api", () => ({
  BlogApiError: class extends Error {},
  updateBlogAbout: (about: string) => updateBlogAbout(about) as unknown,
}));

/* VED-686: «О себе» на личной странице. */
describe("BlogAuthorAbout", () => {
  it("пустой блок чужой страницы не показывается", () => {
    const { container } = render(
      <BlogAuthorAbout initial={null} mine={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("гость видит текст без кнопки правки", () => {
    render(<BlogAuthorAbout initial="Из Вриндавана" mine={false} />);
    expect(screen.getByText("Из Вриндавана")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("хозяин пишет о себе и сохраняет", async () => {
    updateBlogAbout.mockResolvedValue({ about: "Харе Кришна" });
    render(<BlogAuthorAbout initial={null} mine />);
    fireEvent.click(screen.getByRole("button", { name: "Написать о себе" }));
    fireEvent.change(screen.getByRole("textbox", { name: "О себе" }), {
      target: { value: "Харе Кришна" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Харе Кришна")).toBeTruthy();
    expect(updateBlogAbout).toHaveBeenCalledWith("Харе Кришна");
    expect(screen.getByRole("button", { name: "Изменить" })).toBeTruthy();
  });
});
