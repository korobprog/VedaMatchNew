import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactsRequestDto } from "@vedamatch/shared";
import { ContactsRequestsView } from "./contacts-requests-view";

const party = {
  userId: "u2",
  name: "Говинда дас",
  headline: "Повар",
  avatarUrl: null,
  city: "Москва",
};

const incoming: ContactsRequestDto = {
  id: "r1",
  direction: "incoming",
  status: "pending",
  message: "Ищу повара на программу",
  createdAt: "2026-08-10T10:00:00.000Z",
  respondedAt: null,
  user: party,
  contacts: null,
};

const outgoingAccepted: ContactsRequestDto = {
  id: "r2",
  direction: "outgoing",
  status: "accepted",
  message: null,
  createdAt: "2026-08-09T10:00:00.000Z",
  respondedAt: "2026-08-09T12:00:00.000Z",
  user: { ...party, userId: "u3", name: "Радха дд" },
  contacts: {
    socialLinks: { telegram: "https://t.me/radha" },
    messengers: { whatsapp: "+79990000000" },
  },
};

const outgoingPending: ContactsRequestDto = {
  ...outgoingAccepted,
  id: "r3",
  status: "pending",
  user: { ...party, userId: "u4", name: "Нанда дас" },
  contacts: null,
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

function stub(state: {
  incoming: ContactsRequestDto[];
  outgoing: ContactsRequestDto[];
  remainingToday: number;
}) {
  // Новый Response на каждый вызов: тело читается один раз.
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(json(state)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("ContactsRequestsView", () => {
  it("shows how many requests are left for today", async () => {
    stub({ incoming: [], outgoing: [], remainingToday: 3 });
    render(<ContactsRequestsView />);

    expect(await screen.findByTestId("contacts-remaining")).toHaveTextContent(
      "Сегодня можно отправить ещё 3 из 10 запросов.",
    );
  });

  it("keeps the hiding checkbox off and declines without it by default", async () => {
    const fetchMock = stub({
      incoming: [incoming],
      outgoing: [],
      remainingToday: 5,
    });
    render(<ContactsRequestsView />);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Больше не показывать меня этому человеку/,
    });
    expect(checkbox).not.toBeChecked();
    // Пояснение рядом: отказ сам по себе никого не скрывает.
    expect(
      screen.getByText(/Просто отказ ничего не скрывает/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Отказать" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(String(url)).toBe(
      "http://localhost:4000/contacts/requests/r1/respond",
    );
    expect(init?.body).toBe(JSON.stringify({ accept: false }));
  });

  it("sends hiding only after the checkbox is switched on", async () => {
    const fetchMock = stub({
      incoming: [incoming],
      outgoing: [],
      remainingToday: 5,
    });
    render(<ContactsRequestsView />);

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: /Больше не показывать меня этому человеку/,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Отказать" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ accept: false, hideFromRequester: true }),
    );
  });

  it("accepts without touching hiding at all", async () => {
    const fetchMock = stub({
      incoming: [incoming],
      outgoing: [],
      remainingToday: 5,
    });
    render(<ContactsRequestsView />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Открыть контакты" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ accept: true }),
    );
  });

  it("shows disclosed contacts for accepted outgoing requests and none for pending", async () => {
    stub({
      incoming: [],
      outgoing: [outgoingAccepted, outgoingPending],
      remainingToday: 5,
    });
    render(<ContactsRequestsView />);

    const accepted = (await screen.findByText("Радха дд")).closest("article");
    expect(accepted).not.toBeNull();
    expect(
      within(accepted as HTMLElement).getByTestId("contacts-details"),
    ).toHaveTextContent("+79990000000");

    const pending = screen.getByText("Нанда дас").closest("article");
    expect(
      within(pending as HTMLElement).queryByTestId("contacts-details"),
    ).not.toBeInTheDocument();
    expect(
      within(pending as HTMLElement).getByRole("button", {
        name: "Отозвать запрос",
      }),
    ).toBeInTheDocument();
  });

  it("shows the Russian error text the backend sent on a failed answer", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ incoming: [incoming], outgoing: [], remainingToday: 5 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "На этот запрос уже отвечено" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContactsRequestsView />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Открыть контакты" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "На этот запрос уже отвечено",
    );
  });
});
