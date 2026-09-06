import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LibraryQuickAccessWidget } from "./library-quick-access-widget";

const latest = {
  id: "e1",
  title: "Лекция о Гите, часть 3",
  type: "video" as const,
  rubric: "Лекции и видео",
  isFresh: true,
};

describe("LibraryQuickAccessWidget", () => {
  it("без материала ничего не рисует", () => {
    const { container } = render(
      <LibraryQuickAccessWidget latest={null} weekCount={5} weekCountCapped={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("свежий материал: подпись «новое», тип и рубрика, ссылка на материал, счёт за неделю", () => {
    render(<LibraryQuickAccessWidget latest={latest} weekCount={3} weekCountCapped={false} />);

    expect(screen.getByRole("link", { name: /Лекция о Гите/ })).toHaveAttribute(
      "href",
      "/library/entry/e1",
    );
    expect(screen.getByText("Новое в каталоге")).toBeInTheDocument();
    expect(screen.getByText("Видео · Лекции и видео")).toBeInTheDocument();
    expect(screen.getByText(/за неделю добавлено 3 материала/)).toBeInTheDocument();
  });

  it("старый материал подписан «последнее», без строки про неделю; при обрезке — плюс", () => {
    const { rerender } = render(
      <LibraryQuickAccessWidget
        latest={{ ...latest, isFresh: false, rubric: null }}
        weekCount={0}
        weekCountCapped={false}
      />,
    );
    expect(screen.getByText("Последнее в каталоге")).toBeInTheDocument();
    expect(screen.getByText("Видео")).toBeInTheDocument();
    expect(screen.queryByText(/за неделю/)).not.toBeInTheDocument();

    rerender(<LibraryQuickAccessWidget latest={latest} weekCount={20} weekCountCapped />);
    expect(screen.getByText(/за неделю добавлено 20\+ материалов/)).toBeInTheDocument();
  });
});
