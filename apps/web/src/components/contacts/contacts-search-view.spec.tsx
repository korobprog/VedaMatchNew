import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ContactsCardDto,
  ContactsSearchResponse,
  ContactsTagDto,
} from "@vedamatch/shared";
import { ContactsSearchView } from "./contacts-search-view";

const push = vi.fn();
let currentQuery = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

const tags: ContactsTagDto[] = [
  { id: "tag-pujari", slug: "pujari", kind: "service", nameRu: "Пуджари" },
  { id: "tag-cook", slug: "cook", kind: "service", nameRu: "Повар-прасадарий" },
  { id: "tag-ayurveda", slug: "ayurveda", kind: "profession", nameRu: "Аюрведа" },
];

const card: ContactsCardDto = {
  userId: "u1",
  name: "Радха дд",
  headline: "Повар на праздничных программах",
  about: null,
  offers: null,
  avatarUrl: null,
  city: "Москва",
  country: "Россия",
  age: null,
  languages: ["русский"],
  ashram: "grihastha",
  format: "offline",
  spiritualStage: "devotee",
  isVerifiedDevotee: true,
  isPhotoVerified: true,
  tags: [tags[1]],
  contacts: null,
};

function response(
  overrides: Partial<ContactsSearchResponse> = {},
): ContactsSearchResponse {
  return {
    items: [card],
    page: 1,
    pageSize: 20,
    hasMore: false,
    total: 12,
    facets: [{ tagId: "tag-pujari", count: 7 }],
    ...overrides,
  };
}

function stubApi(search: ContactsSearchResponse) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/contacts/tags") ? { items: tags } : search;
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  push.mockClear();
  currentQuery = "";
  vi.unstubAllGlobals();
});
afterEach(() => vi.unstubAllGlobals());

describe("ContactsSearchView", () => {
  it("shows the exact number of matches when the backend sent one", async () => {
    stubApi(response());
    render(<ContactsSearchView />);

    expect(await screen.findByTestId("contacts-total")).toHaveTextContent(
      "Найдено: 12",
    );
  });

  it("says «мало» without a number when total is null", async () => {
    stubApi(response({ total: null }));
    render(<ContactsSearchView />);

    const total = await screen.findByTestId("contacts-total");
    expect(total).toHaveTextContent("Найдено мало");
    expect(total.textContent).not.toContain("Найдено: ");
    expect(total.textContent).not.toContain("0");
  });

  it("shows a hint instead of results when nothing matched", async () => {
    stubApi(response({ items: [], total: 0 }));
    render(<ContactsSearchView />);

    expect(
      await screen.findByText(/По этим условиям в справочнике никого нет/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("contacts-total")).not.toBeInTheDocument();
  });

  it("shows the Russian error text the backend sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(JSON.stringify({ message: "Поиск временно недоступен" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    render(<ContactsSearchView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Поиск временно недоступен",
    );
  });

  it("puts the facet count on the tag it belongs to", async () => {
    stubApi(response());
    render(<ContactsSearchView />);

    const withCount = await screen.findByRole("button", { name: /Пуджари/ });
    expect(withCount).toHaveTextContent("7");
    // По этому тегу счётчика не пришло — придумывать ноль нельзя.
    expect(
      screen.getByRole("button", { name: "Повар-прасадарий" }),
    ).toBeInTheDocument();
  });

  it("removes a single tag when its chip is dismissed and keeps the rest", async () => {
    currentQuery = "tagIds=tag-pujari&tagIds=tag-cook&city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0";
    stubApi(response());
    render(<ContactsSearchView />);

    const chip = await screen.findByRole("button", { name: /^Пуджари.*Снять фильтр$/ });
    await userEvent.click(chip);

    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(String(push.mock.calls[0]?.[0]), "http://localhost");
    expect(url.searchParams.getAll("tagIds")).toEqual(["tag-cook"]);
    expect(url.searchParams.get("city")).toBe("Москва");
  });

  it("drops the page number when the filters change", async () => {
    currentQuery = "page=3&city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0";
    stubApi(response({ page: 3 }));
    render(<ContactsSearchView />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Город: Москва/ }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts"));
  });

  it("never shows contact details in a result card", async () => {
    stubApi(
      response({
        items: [
          {
            ...card,
            // Даже если бэкенд однажды пришлёт контакты, выдача их не рисует:
            // их открывает только согласие владельца.
            contacts: {
              socialLinks: { telegram: "https://t.me/secret" },
              messengers: { whatsapp: "+79990000000" },
            },
          },
        ],
      }),
    );
    render(<ContactsSearchView />);

    const article = await screen.findByRole("article");
    expect(within(article).getByText("Радха дд")).toBeInTheDocument();
    expect(article.textContent).not.toContain("t.me");
    expect(article.textContent).not.toContain("79990000000");
    // Единственная ссылка карточки ведёт на её страницу, а не на мессенджер.
    const links = Array.from(article.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/contacts/users/u1",
    ]);
  });
});
