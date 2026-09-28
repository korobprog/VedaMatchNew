import { act, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalBreadcrumbs } from "./portal-breadcrumbs";
import ru from "../../messages/ru.json";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

function renderAt(path: string) {
  pathname = path;
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <PortalBreadcrumbs />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  document.title = "";
});

describe("PortalBreadcrumbs", () => {
  it("на Главной не рисуется", () => {
    const { container } = renderAt("/");
    expect(container).toBeEmptyDOMElement();
  });

  it("на рубрике Образования не рисуется: там свои крошки", () => {
    const { container } = renderAt("/library/bhakti");
    expect(container).toBeEmptyDOMElement();
  });

  it("путь — список ссылок, текущий шаг не ссылка", () => {
    renderAt("/market/orders/42");
    const nav = screen.getByRole("navigation", { name: "Путь" });
    const items = within(nav).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.replace("›", "").trim())).toEqual([
      "Главная",
      "Рынок",
      "Заказы",
      "Заказ",
    ]);
    expect(within(nav).getByRole("link", { name: "Рынок" })).toHaveAttribute(
      "href",
      "/market",
    );
    expect(within(nav).queryByRole("link", { name: "Заказ" })).toBeNull();
    expect(within(nav).getByText("Заказ")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("последний шаг берёт заголовок страницы", async () => {
    document.title = "Чётки из туласи — VedaMatch";
    renderAt("/market/listing/abc");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText("Чётки из туласи")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("строка прокручена к концу", () => {
    const scrollWidth = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(500);
    renderAt("/travel/manage/s1/cash/stats");
    const list = screen.getByRole("list");
    expect(list.parentElement!.scrollLeft).toBe(500);
    scrollWidth.mockRestore();
  });
});
