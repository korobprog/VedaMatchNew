import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VacanciesFeedView } from "./vacancies-feed-view";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

const offer = {
  id: "o1",
  kind: "work",
  title: "Повар в кафе",
  description: null,
  audience: "everyone",
  city: "Москва",
  country: null,
  lat: null,
  lon: null,
  placePrecision: "city",
  isRemote: false,
  workFormat: "onsite",
  employment: null,
  schedule: null,
  pay: { min: 60000, max: null, currency: "RUB", period: "month", negotiable: false },
  sevaTerm: null,
  sevaUntil: null,
  perks: [],
  dueAt: null,
  status: "published",
  moderatorNote: null,
  author: { userId: "u1", name: "Ишвара дас", avatarUrl: null },
  postedAs: null,
  publishedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  closedAt: null,
  canRenew: false,
  viewsCount: 0,
  responsesCount: 2,
  isMine: false,
  myResponse: null,
};

function mockFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/vacancies")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [offer], nextCursor: null }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe("VacanciesFeedView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("рисует карточку с оплатой, городом и числом откликов", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<VacanciesFeedView />);

    expect(await screen.findByText("Повар в кафе")).toBeInTheDocument();
    expect(screen.getByText(/от 60/)).toBeInTheDocument();
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("вид выбирается как radiogroup и уходит в запрос", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<VacanciesFeedView />);
    await screen.findByText("Повар в кафе");

    const seva = screen.getByRole("radio", { name: "Служение" });
    await user.click(seva);
    expect(seva).toHaveAttribute("aria-checked", "true");

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((u) => u.includes("kind=seva"))).toBe(true);
    });
  });

  it("фильтр «удалённо» запоминается между заходами", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    const { unmount } = render(<VacanciesFeedView />);
    await screen.findByText("Повар в кафе");
    await user.click(screen.getByLabelText("Удалённо или из любого города"));
    await vi.waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem("vacancies:feed-filters") ?? "{}"),
      ).toMatchObject({ remote: true }),
    );
    unmount();

    render(<VacanciesFeedView />);
    expect(
      await screen.findByLabelText("Удалённо или из любого города"),
    ).toBeChecked();
  });

  it("в кабинете фильтры не восстанавливаются и запрос идёт с mine", async () => {
    window.localStorage.setItem(
      "vacancies:feed-filters",
      JSON.stringify({ kind: "seva", city: "", remote: true, communityOnly: false }),
    );
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<VacanciesFeedView mine />);
    await screen.findByText("Повар в кафе");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(`${API_URL}/vacancies?mine=true`);
    expect(url).not.toContain("kind=seva");
  });
});
