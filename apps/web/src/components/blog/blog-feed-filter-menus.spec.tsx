import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BlogCategoryFilter,
  BlogLineageFilter,
} from "./blog-feed-filter-menus";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/blog",
}));

beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, "", "/blog");
});

/* VED-590: «у каждого, кто читает посты Блог-ленты, должна быть
   кнопка-значок — отфильтровать по этим категориям». */
describe("BlogCategoryFilter", () => {
  it("выбор категории пишется в адрес ленты", async () => {
    const user = userEvent.setup();
    render(<BlogCategoryFilter value={null} />);

    await user.click(
      screen.getByRole("button", { name: "Категории постов: все" }),
    );
    expect(screen.getByRole("button", { name: "Все" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Жизнь преданных" }));

    expect(push).toHaveBeenCalledWith("/blog?category=devotee_life", {
      scroll: false,
    });
  });

  it("«Все» снимает фильтр и оставляет линию", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/blog?category=news&lineage=iskcon");
    render(<BlogCategoryFilter value="news" />);

    await user.click(
      screen.getByRole("button", { name: "Категории постов: Новости" }),
    );
    await user.click(screen.getByRole("button", { name: "Все" }));

    expect(push).toHaveBeenCalledWith("/blog?lineage=iskcon", {
      scroll: false,
    });
  });
});

/* VED-590/596: «кнопка-значок (домик) — фильтр по организациям… у всех,
   включая админов». */
describe("BlogLineageFilter", () => {
  it("ISKCON выбирается сразу, без второго шага", async () => {
    const user = userEvent.setup();
    render(<BlogLineageFilter value={null} />);

    await user.click(
      screen.getByRole("button", { name: "Фильтр по организациям: все линии" }),
    );
    await user.click(screen.getByRole("button", { name: "ISKCON" }));

    expect(push).toHaveBeenCalledWith("/blog?lineage=iskcon", {
      scroll: false,
    });
  });

  it("Гаудия-матх раскрывается конкретными матхами, без «Любой» (VED-568)", async () => {
    const user = userEvent.setup();
    render(<BlogLineageFilter value={null} />);

    await user.click(
      screen.getByRole("button", { name: /Фильтр по организациям/ }),
    );
    const group = screen.getByRole("button", { name: "Гаудия-матх" });
    expect(group).toHaveAttribute("aria-expanded", "false");
    await user.click(group);
    expect(
      screen.queryByRole("button", { name: "Любой Гаудия-матх" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: /^IPBYS/ }));

    expect(push).toHaveBeenCalledWith("/blog?lineage=ipbys", {
      scroll: false,
    });
  });

  it("группа текущего выбора раскрыта сразу, «Все линии» снимает фильтр", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/blog?lineage=ipbys");
    render(<BlogLineageFilter value="ipbys" />);

    await user.click(
      screen.getByRole("button", { name: /Фильтр по организациям/ }),
    );
    expect(screen.getByRole("button", { name: "Гаудия-матх" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /^IPBYS/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Все линии" }));
    expect(push).toHaveBeenCalledWith("/blog", { scroll: false });
  });
});
