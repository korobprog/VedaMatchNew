import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAnnouncementDto } from "@vedamatch/shared";
import { PortalNews } from "./portal-news";

vi.mock("@/lib/http-client", () => ({
  API_URL: "http://api.test",
  apiFetch: vi.fn(),
}));

const { apiFetch } = await import("@/lib/http-client");
const ack = vi.mocked(apiFetch);

function news(overrides: Partial<PublicAnnouncementDto> = {}): PublicAnnouncementDto {
  return {
    id: "n1",
    title: "Открыли Студию",
    body: "Свои рилсы живут в отдельном разделе",
    publishedAt: "2026-08-20T09:00:00.000Z",
    pinned: false,
    acknowledged: false,
    ...overrides,
  };
}

/** Длинный текст: карточка обязана его сократить и предложить окно. */
const LONG = `Первое предложение новости. ${"ещё немного текста. ".repeat(20)}`;

// Тело в скобках, а не стрелка-выражение: `mockResolvedValue` возвращает сам
// мок, а функцию из хука vitest считает уборкой и вызовет её после теста —
// в счётчике вызовов появлялся лишний пустой.
beforeEach(() => {
  ack.mockResolvedValue(new Response("{}", { status: 200 }));
});
afterEach(() => {
  ack.mockReset();
});

describe("PortalNews", () => {
  it("показывает закреплённую новость и не даёт закрыть её крестиком", async () => {
    render(<PortalNews items={[news({ pinned: true })]} />);

    expect(await screen.findByText("Открыли Студию")).toBeInTheDocument();
    expect(
      screen.getByText("Свои рилсы живут в отдельном разделе"),
    ).toBeInTheDocument();
    // Крестик убрали: новость уходит только по «ознакомлен».
    expect(
      screen.queryByRole("button", { name: "Скрыть новость" }),
    ).not.toBeInTheDocument();
  });

  it("по галочке отмечает на сервере и убирает новость", async () => {
    const user = userEvent.setup();
    render(<PortalNews items={[news({ pinned: true })]} />);

    await user.click(
      await screen.findByRole("checkbox", { name: "Ознакомлен: Открыли Студию" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Открыли Студию")).not.toBeInTheDocument(),
    );
    expect(ack).toHaveBeenCalledWith(
      "http://api.test/changelog/announcements/n1/ack",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("уже отмеченную новость не показывает", () => {
    render(<PortalNews items={[news({ pinned: true, acknowledged: true })]} />);

    expect(screen.queryByText("Открыли Студию")).not.toBeInTheDocument();
  });

  it("новость остаётся, если отметка не прошла", async () => {
    ack.mockResolvedValue(new Response("нет", { status: 500 }));
    const user = userEvent.setup();
    render(<PortalNews items={[news({ pinned: true })]} />);

    await user.click(
      await screen.findByRole("checkbox", { name: "Ознакомлен: Открыли Студию" }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Открыли Студию")).toBeInTheDocument();
  });

  it("длинную новость сокращает и открывает окном целиком", async () => {
    const user = userEvent.setup();
    render(<PortalNews items={[news({ pinned: true, body: LONG })]} />);

    expect(screen.queryByText(LONG.trim())).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Читать полностью" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Открыли Студию" });
    expect(dialog).toHaveTextContent("Первое предложение новости.");
    // В окне та же галочка: прочитал — там же и отметил.
    expect(
      screen.getAllByRole("checkbox", { name: "Ознакомлен: Открыли Студию" }),
    ).toHaveLength(2);
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

  it("без новостей оставляет только обратную связь", async () => {
    // Написать в поддержку человек хочет независимо от того, есть ли новости.
    render(<PortalNews items={[]} />);

    const support = await screen.findByRole("link", { name: /Написать в поддержку/ });
    expect(support).toHaveAttribute("href", "/support");
    expect(screen.queryByText("Все новости")).not.toBeInTheDocument();
  });

  it("одной кнопкой отмечает все новости разом", async () => {
    const user = userEvent.setup();
    render(
      <PortalNews
        items={[
          news({ id: "pin", title: "Главная новость", pinned: true }),
          news({ id: "a", title: "Первая" }),
          news({ id: "b", title: "Вторая" }),
        ]}
      />,
    );

    // В счётчике всё неотмеченное, а не только показанные на главной.
    await user.click(
      await screen.findByRole("button", { name: /Ознакомлен со всеми \(3\)/ }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Главная новость")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Первая")).not.toBeInTheDocument();
    // Один запрос на всё, а не по одному на новость.
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(
      "http://api.test/changelog/announcements/ack-all",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("считает и те новости, что на главную не поместились", async () => {
    render(
      <PortalNews
        items={Array.from({ length: 6 }, (_, index) =>
          news({ id: `n${index}`, title: `Новость ${index}` }),
        )}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /Ознакомлен со всеми \(6\)/ }),
    ).toBeInTheDocument();
  });

  it("ради одной новости кнопку «со всеми» не показывает", async () => {
    render(<PortalNews items={[news({ pinned: true })]} />);

    expect(await screen.findByText("Открыли Студию")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ознакомлен со всеми/ }),
    ).not.toBeInTheDocument();
  });

  it("новости остаются, если отметка «со всеми» не прошла", async () => {
    ack.mockResolvedValue(new Response("нет", { status: 500 }));
    const user = userEvent.setup();
    render(
      <PortalNews
        items={[news({ id: "a", title: "Первая" }), news({ id: "b", title: "Вторая" })]}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /Ознакомлен со всеми/ }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Первая")).toBeInTheDocument();
  });

  it("показывает не больше трёх неотмеченных рядом с закреплённой", async () => {
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
