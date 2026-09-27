import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EntrySortMenu, entrySortHref } from "./entry-sort-menu";

let search = "";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/library/ari",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  search = "";
  push.mockReset();
});

/* VED-573: «Упорядочить» у автора — меню для всех, а не админское дерево. */
describe("EntrySortMenu", () => {
  it("по умолчанию — «Свой порядок», меню из двух пунктов", () => {
    render(<EntrySortMenu locale="ru" />);
    const trigger = screen.getByRole("button", {
      name: "Упорядочить: Свой порядок",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "Свой порядок" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "По алфавиту" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("«По алфавиту» пишет ?sort=title и сохраняет прочие фильтры", () => {
    search = "type=video&cursor=abc";
    render(<EntrySortMenu locale="ru" />);
    fireEvent.click(screen.getByRole("button", { name: /Упорядочить/ }));
    fireEvent.click(screen.getByRole("button", { name: "По алфавиту" }));
    expect(push).toHaveBeenCalledWith("/library/ari?type=video&sort=title", {
      scroll: false,
    });
  });

  it("«Свой порядок» убирает sort из адреса", () => {
    search = "sort=title";
    render(<EntrySortMenu locale="ru" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Упорядочить: По алфавиту" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Свой порядок" }));
    expect(push).toHaveBeenCalledWith("/library/ari", { scroll: false });
  });

  it("повторный выбор текущего порядка адрес не трогает", () => {
    render(<EntrySortMenu locale="ru" />);
    fireEvent.click(screen.getByRole("button", { name: /Упорядочить/ }));
    fireEvent.click(screen.getByRole("button", { name: "Свой порядок" }));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("entrySortHref", () => {
  it("сбрасывает курсор", () => {
    expect(
      entrySortHref("/library/ari", new URLSearchParams("cursor=x"), true),
    ).toBe("/library/ari?sort=title");
  });
});
