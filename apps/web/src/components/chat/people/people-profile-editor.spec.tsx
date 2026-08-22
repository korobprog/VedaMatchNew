import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactsProfileDto, ContactsTagDto } from "@vedamatch/shared";
import { PeopleProfileEditor } from "./people-profile-editor";

const tags: ContactsTagDto[] = Array.from({ length: 15 }, (_, i) => ({
  id: `tag-${i}`,
  slug: `tag-${i}`,
  kind: "skill" as const,
  nameRu: `Навык ${i}`,
}));

const baseProfile: ContactsProfileDto = {
  headline: "Повар на праздничных программах",
  about: null,
  offers: null,
  languages: [],
  ashram: null,
  format: "any",
  visibility: "everyone",
  status: "active",
  pausedUntil: null,
  fieldPrivacy: null,
  requestsFromVerifiedOnly: false,
  tagIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function stubApi(profile: ContactsProfileDto | null, items = tags) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    const body = url.endsWith("/chat/people/tags") ? { items } : { profile };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("PeopleProfileEditor", () => {
  it("shows a loading state and then the form", async () => {
    stubApi(baseProfile);
    render(<PeopleProfileEditor />);

    expect(screen.getByText("Загружаем карточку…")).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Заголовок"),
    ).toBeInTheDocument();
  });

  it("shows the backend message when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      // Новый Response на каждый вызов: тело читается один раз, а запросов два.
      vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(JSON.stringify({ message: "Сервис временно недоступен" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    render(<PeopleProfileEditor />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервис временно недоступен",
    );
  });

  it("marks a card without a headline as «Черновик»", async () => {
    stubApi({ ...baseProfile, headline: null, status: "draft" });
    render(<PeopleProfileEditor />);

    expect(await screen.findByTestId("contacts-status")).toHaveTextContent(
      "Черновик",
    );
    expect(
      screen.getByText(/Черновик — это карточка с пустым заголовком/),
    ).toBeInTheDocument();
  });

  it("marks a filled card as «Опубликована»", async () => {
    stubApi(baseProfile);
    render(<PeopleProfileEditor />);

    expect(await screen.findByTestId("contacts-status")).toHaveTextContent(
      "Опубликована",
    );
  });

  it("explains the visibility level in words, not enum values", async () => {
    const user = userEvent.setup();
    stubApi(baseProfile);
    render(<PeopleProfileEditor />);

    const select = await screen.findByLabelText("Кто видит карточку");
    expect(select).toHaveValue("everyone");
    expect(screen.getByTestId("contacts-visibility-hint")).toHaveTextContent(
      "Карточку найдёт любой участник сообщества.",
    );

    await user.selectOptions(select, "Не в списках, только по прямой ссылке");

    expect(select).toHaveValue("by_link");
    expect(screen.getByTestId("contacts-visibility-hint")).toHaveTextContent(
      /только по ссылке/,
    );
  });

  it("stops tag selection at twelve", async () => {
    const user = userEvent.setup();
    stubApi(baseProfile);
    render(<PeopleProfileEditor />);

    await screen.findByLabelText("Заголовок");
    for (let i = 0; i < 13; i += 1) {
      await user.click(screen.getByRole("button", { name: `Навык ${i}` }));
    }

    expect(screen.getByText(/Выбрано 12 из 12/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Навык 12" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Навык 12" })).toBeDisabled();
  });

  it("sends the edited card and reports success", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(baseProfile);
    render(<PeopleProfileEditor />);

    const headline = await screen.findByLabelText("Заголовок");
    await user.clear(headline);
    await user.type(headline, "Плотник");
    await user.click(screen.getByRole("button", { name: "Сохранить карточку" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Карточка сохранена"),
    );

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe("http://localhost:4000/chat/people/profile");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      headline: "Плотник",
      about: null,
      visibility: "everyone",
      tagIds: [],
    });
  });

  it("keeps the backend error text on a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ message: "Слишком много тегов" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = String(input).endsWith("/chat/people/tags")
        ? { items: tags }
        : { profile: baseProfile };
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PeopleProfileEditor />);
    await screen.findByLabelText("Заголовок");
    await user.click(screen.getByRole("button", { name: "Сохранить карточку" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Слишком много тегов",
    );
  });
});
