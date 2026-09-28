import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CategoryOrderMenu } from "./category-order-menu";
import { getOrganizing, setOrganizing } from "./organize-state";

let search = "";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/library/propovedniki",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  search = "";
  push.mockReset();
});

afterEach(() => {
  act(() => setOrganizing(false));
});

/* VED-573: «Упорядочить» в списке авторов — вид для всех, у админа ещё и
   режим перетаскивания на выбор. */
describe("CategoryOrderMenu", () => {
  it("читателю — два пункта, без админского режима", () => {
    render(<CategoryOrderMenu locale="ru" canOrganize={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Упорядочить: Свой порядок" }),
    );
    expect(
      screen.getByRole("button", { name: "Свой порядок" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "По алфавиту" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.queryByRole("button", { name: "Редактировать порядок" }),
    ).toBeNull();
  });

  it("«По алфавиту» пишет ?order=alpha", () => {
    search = "withDescendants=false";
    render(<CategoryOrderMenu locale="ru" canOrganize={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Упорядочить/ }));
    fireEvent.click(screen.getByRole("button", { name: "По алфавиту" }));
    expect(push).toHaveBeenCalledWith(
      "/library/propovedniki?withDescendants=false&order=alpha",
      { scroll: false },
    );
  });

  /* VED-631: «Когда меняешь отображение на „По алфавиту“, на кнопке
     „Упорядочить“ не должна появляться красная полоска». */
  it("при «По алфавиту» кнопка без розовой каёмки", () => {
    search = "order=alpha";
    render(<CategoryOrderMenu locale="ru" canOrganize />);
    const trigger = screen.getByRole("button", {
      name: "Упорядочить: По алфавиту",
    });
    expect(trigger).toHaveClass("border-glass-brd");
    expect(trigger.className).not.toMatch(/border-magenta/);
  });

  it("«Свой порядок» убирает order из адреса", () => {
    search = "order=alpha";
    render(<CategoryOrderMenu locale="ru" canOrganize={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Упорядочить: По алфавиту" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Свой порядок" }));
    expect(push).toHaveBeenCalledWith("/library/propovedniki", {
      scroll: false,
    });
  });

  it("повторный выбор текущего порядка адрес не трогает", () => {
    render(<CategoryOrderMenu locale="ru" canOrganize />);
    fireEvent.click(screen.getByRole("button", { name: /Упорядочить/ }));
    fireEvent.click(screen.getByRole("button", { name: "Свой порядок" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("админ выбирает «Редактировать порядок», «Готово» возвращает меню", () => {
    render(<CategoryOrderMenu locale="ru" canOrganize />);
    fireEvent.click(screen.getByRole("button", { name: /Упорядочить/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Редактировать порядок" }),
    );
    expect(getOrganizing()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(getOrganizing()).toBe(false);
    expect(
      screen.getByRole("button", { name: "Упорядочить: Свой порядок" }),
    ).toBeInTheDocument();
  });
});
