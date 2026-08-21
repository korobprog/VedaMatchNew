import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { PublicAnnouncementDto } from "@vedamatch/shared";
import { PortalNews } from "./portal-news";

function news(overrides: Partial<PublicAnnouncementDto> = {}): PublicAnnouncementDto {
  return {
    id: "n1",
    title: "Открыли Студию",
    body: "Свои рилсы живут в отдельном разделе",
    publishedAt: "2026-08-20T09:00:00.000Z",
    pinned: false,
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe("PortalNews", () => {
  it("показывает закреплённую новость целиком", async () => {
    render(<PortalNews items={[news({ pinned: true })]} />);

    expect(await screen.findByText("Открыли Студию")).toBeInTheDocument();
    expect(
      screen.getByText("Свои рилсы живут в отдельном разделе"),
    ).toBeInTheDocument();
  });

  it("остальные показывает списком заголовков со ссылкой на все", async () => {
    render(
      <PortalNews
        items={[
          news({ id: "a", title: "Первая" }),
          news({ id: "b", title: "Вторая" }),
        ]}
      />,
    );

    expect(await screen.findByText("Первая")).toBeInTheDocument();
    expect(screen.getByText("Вторая")).toBeInTheDocument();
    // Тела новостей в списке нет: главная существует ради сервисов.
    expect(
      screen.queryByText("Свои рилсы живут в отдельном разделе"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Все новости" })).toHaveAttribute(
      "href",
      "/updates/news",
    );
  });

  it("закрытая новость не возвращается после перезагрузки", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PortalNews items={[news({ pinned: true })]} />);

    await user.click(await screen.findByRole("button", { name: "Скрыть новость" }));
    expect(screen.queryByText("Открыли Студию")).not.toBeInTheDocument();

    unmount();
    render(<PortalNews items={[news({ pinned: true })]} />);
    // Отметка живёт в браузере: ради неё не заводили таблицу на сервере.
    expect(screen.queryByText("Открыли Студию")).not.toBeInTheDocument();
  });

  it("без новостей оставляет только обратную связь", async () => {
    // Написать в поддержку человек хочет независимо от того, есть ли новости.
    render(<PortalNews items={[]} />);

    const support = await screen.findByRole("link", { name: /Написать в поддержку/ });
    expect(support).toHaveAttribute("href", "/support");
    expect(screen.queryByText("Все новости")).not.toBeInTheDocument();
  });

  it("ведёт в поддержку и рядом с новостями", async () => {
    render(<PortalNews items={[news({ pinned: true })]} />);

    expect(await screen.findByText("Открыли Студию")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Написать в поддержку/ }),
    ).toHaveAttribute("href", "/support");
  });

  it("показывает не больше трёх непрочитанных рядом с закреплённой", async () => {
    render(
      <PortalNews
        items={[
          news({ id: "pin", title: "Главная новость", pinned: true }),
          ...Array.from({ length: 5 }, (_, index) =>
            news({ id: `n${index}`, title: `Новость ${index}` }),
          ),
        ]}
      />,
    );

    expect(await screen.findByText("Главная новость")).toBeInTheDocument();
    expect(screen.getByText("Новость 0")).toBeInTheDocument();
    expect(screen.getByText("Новость 2")).toBeInTheDocument();
    expect(screen.queryByText("Новость 3")).not.toBeInTheDocument();
  });
});
