import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactsCardDto } from "@vedamatch/shared";
import { PeopleCardView } from "./people-card-view";

const card: ContactsCardDto = {
  userId: "u1",
  name: "Радха дд",
  headline: "Повар на праздничных программах",
  about: "Готовлю прасад на фестивалях",
  offers: "Помогу организовать кухню на программе",
  avatarUrl: null,
  city: "Москва",
  country: "Россия",
  age: 34,
  languages: ["русский", "хинди"],
  ashram: "grihastha",
  format: "offline",
  spiritualStage: "devotee",
  isVerifiedDevotee: true,
  isPhotoVerified: true,
  tags: [
    { id: "t1", slug: "cook", kind: "service", nameRu: "Повар-прасадарий" },
    { id: "t2", slug: "ayurveda", kind: "profession", nameRu: "Аюрведа" },
  ],
  contacts: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const emptyRequests = { incoming: [], outgoing: [], remainingToday: 10 };

/** Карточка по заданному ответу; список запросов под ней — всегда пустой. */
function stubCard(body: unknown, status = 200) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes("/chat/people/requests")
          ? json(emptyRequests)
          : json(body, status),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("PeopleCardView", () => {
  it("asks the card endpoint for the id it was given", async () => {
    const fetchMock = stubCard(card);
    render(<PeopleCardView userId="u1" />);

    await screen.findByText("Радха дд");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/people/users/u1",
    );
  });

  it("на своей карточке ведёт к её редактору, а не просит контакты у себя", async () => {
    stubCard(card);
    render(<PeopleCardView userId="u1" viewerId="u1" />);

    await screen.findByText("Радха дд");
    expect(
      screen.getByText("Это ваша карточка — так её видят остальные."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Изменить" })).toHaveAttribute(
      "href",
      "/chat/people/profile",
    );
    expect(screen.queryByText("Запросить контакт")).not.toBeInTheDocument();
  });

  it("на чужой карточке блок запроса на месте", async () => {
    stubCard(card);
    render(<PeopleCardView userId="u1" viewerId="u2" />);

    await screen.findByText("Радха дд");
    expect(await screen.findAllByText("Запросить контакт")).not.toHaveLength(0);
    expect(
      screen.queryByText("Это ваша карточка — так её видят остальные."),
    ).not.toBeInTheDocument();
  });

  it("shows the whole card: texts, place, details, badges and tags", async () => {
    stubCard(card);
    render(<PeopleCardView userId="u1" />);

    expect(await screen.findByText("Радха дд")).toBeInTheDocument();
    expect(
      screen.getByText("Повар на праздничных программах"),
    ).toBeInTheDocument();
    expect(screen.getByText("Готовлю прасад на фестивалях")).toBeInTheDocument();
    expect(
      screen.getByText("Помогу организовать кухню на программе"),
    ).toBeInTheDocument();
    expect(screen.getByText("Москва, Россия")).toBeInTheDocument();
    expect(screen.getByText("Грихастха")).toBeInTheDocument();
    expect(screen.getByText("Офлайн")).toBeInTheDocument();
    expect(screen.getByText("Преданный")).toBeInTheDocument();
    expect(screen.getByText("русский, хинди")).toBeInTheDocument();
    expect(screen.getByText("Подтверждён")).toBeInTheDocument();
    expect(screen.getByText("Проверенное фото")).toBeInTheDocument();
    // Теги разложены по разделам, а не свалены в один список.
    expect(screen.getByText("Служение")).toBeInTheDocument();
    expect(screen.getByText("Повар-прасадарий")).toBeInTheDocument();
    expect(screen.getByText("Профессия")).toBeInTheDocument();
    expect(screen.getByText("Аюрведа")).toBeInTheDocument();
  });

  it("keeps contact details out of the card itself and offers to ask for them", async () => {
    stubCard(card);
    render(<PeopleCardView userId="u1" />);

    await screen.findByText("Радха дд");
    expect(screen.queryByTestId("contacts-details")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Запросить контакт" }),
    ).toBeInTheDocument();
  });

  it("shows the contacts the backend disclosed instead of the request form", async () => {
    stubCard({
      ...card,
      contacts: {
        socialLinks: { telegram: "https://t.me/radha" },
        messengers: { whatsapp: "+79990000000" },
      },
    });
    render(<PeopleCardView userId="u1" />);

    const details = await screen.findByTestId("contacts-details");
    expect(details).toHaveTextContent("+79990000000");
    expect(details).toHaveTextContent("https://t.me/radha");
    expect(
      screen.queryByRole("button", { name: "Запросить контакт" }),
    ).not.toBeInTheDocument();
  });

  it("shows a plain «not found» page on 404 without hinting why", async () => {
    stubCard({ message: "Карточка не найдена" }, 404);
    render(<PeopleCardView userId="ghost" />);

    expect(await screen.findByText("Карточка не найдена")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "К поиску по справочнику" }),
    ).toHaveAttribute("href", "/chat/people");
    // 404 не различает «карточки нет» и «вам её не видно» — интерфейс тоже.
    expect(document.body.textContent).not.toMatch(
      /скрыл|скрыт|доступ|не видно|приватн/i,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the Russian error text the backend sent on other failures", async () => {
    stubCard({ message: "Справочник временно недоступен" }, 503);
    render(<PeopleCardView userId="u1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Справочник временно недоступен",
    );
  });
});
