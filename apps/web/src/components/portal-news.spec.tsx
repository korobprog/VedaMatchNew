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
    images: [],
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

  it("без новостей ничего не рисует", () => {
    // Поддержка с главной убрана (VED-238): она живёт в панели горячих
    // кнопок и в меню шапки. От новостей она не зависела и раньше.
    const { container } = render(<PortalNews items={[]} />);

    expect(container).toBeEmptyDOMElement();
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

  // VED-137: к новости прикладывают скриншоты.
  it("на главной показывает первую картинку, все — в окне новости", async () => {
    const user = userEvent.setup();
    const image = (n: number) => ({
      url: `https://cdn.test/announcements/${n}.webp`,
      width: 1280,
      height: 720,
    });
    render(
      <PortalNews
        items={[news({ pinned: true, images: [image(1), image(2), image(3)] })]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Картинка 1 к новости «Открыли Студию»" }),
    ).toHaveAttribute("src", "https://cdn.test/announcements/1.webp");
    expect(
      screen.queryByRole("img", { name: "Картинка 2 к новости «Открыли Студию»" }),
    ).not.toBeInTheDocument();

    // Текст короткий, но картинок больше, чем видно, — окно всё равно нужно.
    await user.click(screen.getByRole("button", { name: "Читать полностью" }));
    const dialog = await screen.findByRole("dialog", { name: "Открыли Студию" });
    expect(
      Array.from(dialog.querySelectorAll("img")).map((img) => img.getAttribute("src")),
    ).toEqual([
      "https://cdn.test/announcements/1.webp",
      "https://cdn.test/announcements/2.webp",
      "https://cdn.test/announcements/3.webp",
    ]);
  });

  it("короткую новость без картинок окном не предлагает", () => {
    render(<PortalNews items={[news({ pinned: true })]} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Читать полностью" }),
    ).not.toBeInTheDocument();
  });
});
