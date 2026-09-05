import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { MotivationPublishedList } from "./published-list";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

function post(
  over: Partial<MotivationAdminCandidateDto> = {},
): MotivationAdminCandidateDto {
  return {
    id: "post-1",
    slug: "gita-2-13",
    title: "Душа не умирает",
    text: "Пояснение к стиху",
    storyText: "Душа не умирает",
    contentDate: "2026-08-16",
    category: "philosophy",
    categoryTitle: "Философия",
    attributionSpeaker: "Прабхупада",
    attributionWork: "Бхагавад-гита",
    attributionLocator: "2.13",
    origin: "editorial",
    imageUrl: "",
    status: "published",
    ...over,
  } as MotivationAdminCandidateDto;
}

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Тело последнего запроса — что именно ушло на сервер. */
function lastBody(fetchMock: ReturnType<typeof stubFetch>) {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("MotivationPublishedList", () => {
  it("говорит, куда идти, когда публиковать ещё нечего", () => {
    render(<MotivationPublishedList posts={[]} />);

    expect(screen.getByText(/Пока ничего не опубликовано/)).toBeInTheDocument();
  });

  it("ищет по названию, цитате, автору и рубрике", async () => {
    const user = userEvent.setup();
    render(
      <MotivationPublishedList
        posts={[
          post(),
          post({ id: "post-2", title: "Служение", attributionSpeaker: "Госвами" }),
        ]}
      />,
    );

    await user.type(screen.getByRole("searchbox"), "госвами");

    expect(screen.getByText("Найдено: 1 из 2")).toBeInTheDocument();
    expect(screen.getByText("Служение")).toBeInTheDocument();
    expect(screen.queryByText("Душа не умирает")).not.toBeInTheDocument();
  });

  it("открывает карточку в ленте по её слагу", () => {
    render(<MotivationPublishedList posts={[post()]} />);

    expect(
      screen.getByRole("link", { name: "Открыть в ленте" }),
    ).toHaveAttribute("href", "/motivation?post=gita-2-13");
  });

  it("снимает с показа и возвращает обратно", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    const { rerender } = render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Скрыть/ }));

    await waitFor(() => expect(lastBody(fetchMock)).toEqual({ hidden: true }));

    rerender(<MotivationPublishedList posts={[post({ status: "hidden" })]} />);
    await user.click(screen.getByRole("button", { name: /Вернуть в ленту/ }));

    await waitFor(() => expect(lastBody(fetchMock)).toEqual({ hidden: false }));
  });

  it("помечает снятое с показа, чтобы его не искали в ленте", () => {
    render(<MotivationPublishedList posts={[post({ status: "hidden" })]} />);

    expect(screen.getByText("Скрыто из ленты")).toBeInTheDocument();
  });

  it("правит текст и отправляет только русский перевод", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));
    const title = screen.getByLabelText("Заголовок");
    await user.clear(title);
    await user.type(title, "Душа вечна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(lastBody(fetchMock)).toEqual({
        translations: {
          ru: {
            title: "Душа вечна",
            text: "Пояснение к стиху",
            storyText: "Душа не умирает",
          },
        },
      }),
    );
  });

  it("нечего сохранять — кнопка не нажимается", async () => {
    const user = userEvent.setup();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("не молчит, когда список не загрузился", () => {
    render(<MotivationPublishedList posts={null} />);

    expect(
      within(document.body).getByText(/опубликованные вдохновения/),
    ).toBeInTheDocument();
  });

  it("правит подпись и предупреждает, чем это обойдётся", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));
    const speaker = screen.getByLabelText("Автор");
    await user.clear(speaker);
    await user.type(speaker, "Бхактивинода");

    expect(
      screen.getByText(/снимет отметку о проверенном источнике/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(lastBody(fetchMock)).toEqual({
        attribution: {
          speaker: "Бхактивинода",
          work: "Бхагавад-гита",
          locator: "2.13",
        },
      }),
    );
  });

  it("правка одной опечатки в тексте подпись не трогает", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));
    await user.type(screen.getByLabelText("Заголовок"), "!");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // Иначе отметка о проверенном источнике слетала бы от лишней запятой.
    await waitFor(() =>
      expect(lastBody(fetchMock)).not.toHaveProperty("attribution"),
    );
  });

  it("открывает правку той карточки, ради которой пришли из ленты", () => {
    render(<MotivationPublishedList posts={[post()]} openSlug="gita-2-13" />);

    expect(screen.getByLabelText("Заголовок")).toBeInTheDocument();
  });

  it("без ссылки из ленты все карточки закрыты", () => {
    render(<MotivationPublishedList posts={[post()]} />);

    expect(screen.queryByLabelText("Заголовок")).not.toBeInTheDocument();
  });
});
