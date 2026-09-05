import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactsRequestDto } from "@vedamatch/shared";
import { PeopleRequestButton } from "./people-request-button";

const outgoingPending: ContactsRequestDto = {
  id: "r1",
  direction: "outgoing",
  status: "pending",
  message: null,
  createdAt: "2026-08-10T10:00:00.000Z",
  respondedAt: null,
  user: {
    userId: "u2",
    name: "Говинда дас",
    headline: null,
    avatarUrl: null,
    city: null,
  },
  contacts: null,
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

const state = (
  outgoing: ContactsRequestDto[] = [],
  remainingToday = 10,
) => ({ incoming: [], outgoing, remainingToday });

afterEach(() => vi.unstubAllGlobals());

describe("PeopleRequestButton", () => {
  it("shows the open contacts instead of the form when access is granted", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(state())));
    render(
      <PeopleRequestButton
        userId="u2"
        viewerId="u1"
        contacts={{
          socialLinks: { telegram: "https://t.me/govinda" },
          messengers: { phone: "+79990000000" },
        }}
      />,
    );

    const details = await screen.findByTestId("contacts-details");
    expect(details).toHaveTextContent("+79990000000");
    expect(
      screen.queryByRole("button", { name: "Запросить контакт" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Написать в чат" })).toHaveAttribute(
      "href",
      "/chat/with/u2",
    );
  });

  it("предлагает написать в чат, даже если способов связи не указано", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(state())));
    render(
      <PeopleRequestButton
        userId="u2"
        viewerId="u1"
        contacts={{ socialLinks: {}, messengers: {} }}
      />,
    );

    expect(
      await screen.findByText(
        "Доступ открыт, но человек пока не указал ни одного способа связи.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Написать в чат" })).toHaveAttribute(
      "href",
      "/chat/with/u2",
    );
  });

  it("offers the form with a counter when access is closed", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(state())));
    render(<PeopleRequestButton userId="u2" viewerId="u1" contacts={null} />);

    expect(
      await screen.findByRole("button", { name: "Запросить контакт" }),
    ).toBeEnabled();
    expect(screen.queryByTestId("contacts-details")).not.toBeInTheDocument();
    expect(screen.getByText(/Осталось символов: 500/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox"), "привет");
    expect(screen.getByText(/Осталось символов: 494/)).toBeInTheDocument();
  });

  it("sends the message and then reports the request is waiting", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(state()))
      .mockResolvedValueOnce(json(state([outgoingPending], 9)));
    vi.stubGlobal("fetch", fetchMock);
    render(<PeopleRequestButton userId="u2" viewerId="u1" contacts={null} />);

    await userEvent.type(
      await screen.findByRole("textbox"),
      "ищу повара на программу",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Запросить контакт" }),
    );

    expect(
      await screen.findByText("Запрос отправлен, ждём ответа."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ toUserId: "u2", message: "ищу повара на программу" }),
    );
  });

  it("shows a pending request that already existed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(json(state([outgoingPending]))),
    );
    render(<PeopleRequestButton userId="u2" viewerId="u1" contacts={null} />);

    expect(
      await screen.findByText("Запрос отправлен, ждём ответа."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Запросить контакт" }),
    ).not.toBeInTheDocument();
  });

  it("blocks sending when today's limit is spent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(json(state([], 0))),
    );
    render(<PeopleRequestButton userId="u2" viewerId="u1" contacts={null} />);

    expect(
      await screen.findByText(/Лимит запросов на сегодня исчерпан/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Запросить контакт" }),
    ).toBeDisabled();
  });

  it("offers the own card instead of asking yourself for contacts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(state()));
    vi.stubGlobal("fetch", fetchMock);
    render(<PeopleRequestButton userId="u1" viewerId="u1" contacts={null} />);

    expect(
      await screen.findByRole("link", { name: "Моя карточка" }),
    ).toHaveAttribute("href", "/chat/people/profile");
    expect(
      screen.queryByRole("button", { name: "Запросить контакт" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Сегодня можно отправить/)).not.toBeInTheDocument();
    // Список запросов для своей карточки не нужен — за ним и не ходим.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the Russian error text the backend sent", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(state()))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message:
              "Этот человек принимает обращения только от подтверждённых преданных",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PeopleRequestButton userId="u2" viewerId="u1" contacts={null} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Запросить контакт" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Этот человек принимает обращения только от подтверждённых преданных",
      ),
    );
  });

  it("администрации даёт написать сразу, без запроса доступа", async () => {
    render(
      <PeopleRequestButton
        userId="user-2"
        viewerId="admin-1"
        viewerIsStaff
        contacts={null}
      />,
    );

    expect(
      await screen.findByRole("link", { name: "Написать в чат" }),
    ).toHaveAttribute("href", "/chat/with/user-2");
    // Форма запроса при этом не нужна: беседа откроется и без согласия.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("но контакты человека администрации не раскрывает", async () => {
    render(
      <PeopleRequestButton
        userId="user-2"
        viewerId="admin-1"
        viewerIsStaff
        contacts={null}
      />,
    );

    // Право писать и право видеть телефон — разные вещи.
    expect(
      await screen.findByText(/Контакты человека при этом остаются закрытыми/),
    ).toBeInTheDocument();
  });

  it("обычному участнику ничего лишнего не обещает", async () => {
    render(
      <PeopleRequestButton userId="user-2" viewerId="user-1" contacts={null} />,
    );

    // Дожидаемся загрузки списка запросов, иначе проверяем пустой экран.
    await screen.findByRole("button", { name: /Запросить/i });
    expect(screen.queryByText(/Написать без запроса/)).not.toBeInTheDocument();
  });
});
