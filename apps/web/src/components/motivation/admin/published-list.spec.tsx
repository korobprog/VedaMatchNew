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
    text: "Душа не умирает\n\nПояснение к стиху",
    storyText: "Душа не умирает",
    imageText: "",
    captionInImage: false,
    videoUrl: "",
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
          post({
            id: "post-2",
            text: "Служение — вечная природа",
            attributionSpeaker: "Госвами",
          }),
        ]}
      />,
    );

    await user.type(screen.getByRole("searchbox"), "госвами");

    expect(screen.getByText("Найдено: 1 из 2")).toBeInTheDocument();
    expect(screen.getByText("Служение — вечная природа")).toBeInTheDocument();
    expect(screen.queryByText("Душа не умирает")).not.toBeInTheDocument();
  });

  // VED-199: из текста в карточке — один афоризм.
  it("показывает в карточке только афоризм — без заголовка, автора и источника", () => {
    render(
      <MotivationPublishedList
        posts={[post({ title: "Заголовок-невидимка" })]}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Душа не умирает")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("Заголовок-невидимка");
    expect(card).not.toHaveTextContent("Прабхупада");
    expect(card).not.toHaveTextContent("Пояснение к стиху");
    expect(card).not.toHaveTextContent("2026-08-16");
  });

  // VED-199: кнопки — квадраты со значками; подпись — для скринридера и в подсказке.
  it("подписывает каждую кнопку-значок для скринридера и подсказкой", () => {
    render(<MotivationPublishedList posts={[post()]} />);

    for (const name of [
      "Открыть в ленте",
      "Править текст",
      "Скрыть",
      "Заменить картинку",
      "Удалить",
    ]) {
      const control = screen.getByRole(
        name === "Открыть в ленте" ? "link" : "button",
        { name },
      );
      expect(control).toHaveAttribute("title");
      // Подписи на самой кнопке нет — только значок.
      expect(control).toHaveTextContent("");
    }
  });

  it("открывает карточку в ленте по её слагу", () => {
    render(<MotivationPublishedList posts={[post()]} />);

    expect(
      screen.getByRole("link", { name: "Открыть в ленте" }),
    ).toHaveAttribute("href", "/motivation?post=gita-2-13");
  });

  it("спрашивает про удаление под карточкой и удаляет после подтверждения", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Удалить вдохновение вместе с цитатой/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Да, удалить" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method: "DELETE" }),
    );
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
    const quote = screen.getByLabelText(/Полный текст/);
    await user.clear(quote);
    await user.type(quote, "Душа вечна");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // Заголовок и подпись для Stories не уходят: сервер оставит их как есть.
    await waitFor(() =>
      expect(lastBody(fetchMock)).toEqual({
        translations: {
          ru: { text: "Душа вечна\n\nПояснение к стиху" },
        },
      }),
    );
  });

  // VED-199: графы «Заголовок» нет.
  it("не предлагает править заголовок", async () => {
    const user = userEvent.setup();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));

    expect(screen.queryByLabelText("Заголовок")).not.toBeInTheDocument();
  });

  // VED-241: надпись на картинке и полный текст — порознь.
  it("правит текст на картинке, не трогая полный", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<MotivationPublishedList posts={[post()]} />);

    await user.click(screen.getByRole("button", { name: /Править текст/ }));
    await user.type(screen.getByLabelText(/Текст на картинке/), " Коротко ");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(lastBody(fetchMock)).toEqual({
        translations: {
          ru: {
            text: "Душа не умирает\n\nПояснение к стиху",
            imageText: "Коротко",
          },
        },
      }),
    );
  });

  it("стёртая надпись на картинке уходит пустой — картинка вернётся к полному тексту", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(
      <MotivationPublishedList posts={[post({ imageText: "Коротко" })]} />,
    );

    await user.click(screen.getByRole("button", { name: /Править текст/ }));
    await user.clear(screen.getByLabelText(/Текст на картинке/));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(lastBody(fetchMock)).toMatchObject({
        translations: { ru: { imageText: "" } },
      }),
    );
  });

  it.each([
    ["открытки", { captionInImage: true }, /напечатан в самом файле/],
    ["ролика", { videoUrl: "https://cdn/v.mp4" }, /вшит в кадр/],
  ])(
    "у %s поля «Текст на картинке» нет — он вшит в файл",
    async (_kind, over, hint) => {
      const user = userEvent.setup();
      render(<MotivationPublishedList posts={[post(over)]} />);

      await user.click(screen.getByRole("button", { name: /Править текст/ }));

      expect(screen.queryByLabelText(/Текст на картинке/)).not.toBeInTheDocument();
      expect(screen.getByText(hint)).toBeInTheDocument();
    },
  );

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
    await user.type(screen.getByLabelText(/Полный текст/), "!");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    // Иначе отметка о проверенном источнике слетала бы от лишней запятой.
    await waitFor(() =>
      expect(lastBody(fetchMock)).not.toHaveProperty("attribution"),
    );
  });

  it("открывает правку той карточки, ради которой пришли из ленты", () => {
    render(<MotivationPublishedList posts={[post()]} openSlug="gita-2-13" />);

    expect(screen.getByLabelText(/Полный текст/)).toBeInTheDocument();
  });

  it("подводит к карточке из ленты, а не оставляет её за экраном", () => {
    const scrollIntoView = vi.fn();
    const spy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(scrollIntoView);

    render(<MotivationPublishedList posts={[post()]} openSlug="gita-2-13" />);

    // Список опубликованного показывает своё начало, а нужная карточка лежит
    // на второй-третьей тысяче пикселей вниз: без прокрутки человек нажимал
    // «Править» на одном афоризме и упирался в чужой.
    expect(scrollIntoView).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("говорит, когда карточки из ленты среди опубликованного нет", () => {
    render(<MotivationPublishedList posts={[post()]} openSlug="snyato" />);

    // Молча показывать начало списка нельзя: человек решит, что «Править»
    // открыло не тот афоризм.
    expect(screen.getByRole("status")).toHaveTextContent(/не нашлась/);
  });

  it("без ссылки из ленты все карточки закрыты", () => {
    render(<MotivationPublishedList posts={[post()]} />);

    expect(screen.queryByLabelText(/Полный текст/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
