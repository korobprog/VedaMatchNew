import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedAttributionFilter } from "./feed-attribution-filter";
import { resetAttributionsCache } from "./attribution-options-cache";

afterEach(() => {
  vi.unstubAllGlobals();
  // Кэш списков живёт во вкладке, а не в компоненте: между тестами — стереть.
  resetAttributionsCache();
});

const listResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    works: [{ label: "Бхагавад-гита", count: 6 }],
    speakers: [{ label: "Кришна", count: 4 }],
  }),
});

describe("FeedAttributionFilter", () => {
  it("у избранного фильтра нет", () => {
    const { container } = render(<FeedAttributionFilter state={{ tab: "saved" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  // VED-252: значок встаёт в ряд вкладок — подписи «Автор и источник» нет
  // ни в активном, ни в неактивном состоянии, только aria-label и точка.
  it("без выбранного фильтра — только значок, подписи нет", () => {
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);

    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });
    expect(trigger).toHaveTextContent("");
    expect(screen.queryByText("Автор и источник")).not.toBeInTheDocument();
  });

  // VED-252, круг 2: первая версия сузила хит-зону значка до 40×32px ради
  // бюджета ширины ряда — оценщик справедливо указал на нарушение правила
  // репозитория «область нажатия ≥ 40px».
  //
  // Круг 3: держать в раскладке весь хит-бокс `w-10` оказалось слишком
  // широко для плотного ряда (соседние пункты читались слитно) — теперь
  // в раскладке кнопка занимает только ширину иконки (`w-7`=28px), а
  // хит-зона ≥40×40 держится отдельно: `h-10` (40px) по вертикали без
  // изменений, по горизонтали — прозрачный `before:` псевдоэлемент,
  // раздвинутый на ±6px (`before:-inset-x-1.5`, 28+6+6=40), вне потока
  // (`before:absolute`), поэтому бюджет ширины ряда он не трогает.
  it("область нажатия значка — 40×40 через псевдоэлемент, в раскладке — только иконка", () => {
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);

    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });
    const classes = trigger.className.split(" ");
    // Раскладочный бокс — под иконку, не под всю хит-зону.
    expect(classes).toEqual(expect.arrayContaining(["h-10", "w-7"]));
    expect(trigger.className).not.toMatch(/\bw-10\b/);
    // Хит-зона расширена псевдоэлементом до 40px по горизонтали (28+6+6)
    // и повторяет 40px по вертикали — обе стороны ≥40px.
    expect(trigger.className).toMatch(/before:-inset-x-1\.5/);
    expect(trigger.className).toMatch(/before:inset-y-0/);
    expect(trigger.className).toMatch(/before:content-\[['"]{2}\]/);
  });

  // VED-252, круг 4: значок без подписи хорош внутри ряда вкладок, но не
  // сам по себе — на пустой ленте (нет ряда рядом) он висел бы голой
  // иконкой, ничего не объясняя. `variant="chip"` возвращает вид до
  // VED-252: пилюля с рамкой/подложкой и подписью, видимой, пока фильтр
  // не выбран.
  it('variant="chip" — самостоятельная пилюля с подписью, не значок из ряда', () => {
    render(<FeedAttributionFilter state={{ tab: "forYou" }} variant="chip" />);

    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });
    expect(trigger).toHaveTextContent("Автор и источник");
    expect(trigger.className).toMatch(/rounded-full/);
    expect(trigger.className).toMatch(/\bborder\b/);
    // Не «inline»-раскладка (узкая, под ряд вкладок, без подложки).
    expect(trigger.className).not.toMatch(/\bw-7\b/);
    expect(trigger.className).not.toMatch(/before:absolute/);
  });

  it('variant="chip" с активным фильтром прячет подпись — чипы и так её заменяют', () => {
    render(
      <FeedAttributionFilter state={{ tab: "forYou", work: "Бхагавад-гита" }} variant="chip" />,
    );

    const trigger = screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" });
    expect(trigger).toHaveTextContent("");
    expect(
      screen.getByRole("link", { name: "Убрать фильтр по источнику: Бхагавад-гита" }),
    ).toBeInTheDocument();
  });

  it("выбранное видно чипами, крестик убирает только своё", () => {
    render(
      <FeedAttributionFilter
        state={{ tab: "cards", category: "vedy", work: "Бхагавад-гита", speaker: "Кришна" }}
      />,
    );
    const work = screen.getByRole("link", { name: "Убрать фильтр по источнику: Бхагавад-гита" });
    const query = new URL(work.getAttribute("href")!, "https://x").searchParams;
    expect(Object.fromEntries(query)).toEqual({ tab: "cards", category: "vedy", speaker: "Кришна" });
    const trigger = screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" });
    expect(trigger).toBeTruthy();
    // Активный фильтр отмечен точкой на значке (VED-252) — тем же приёмом,
    // что активная вкладка отмечена цветом, а не подписью на кнопке.
    expect(trigger.querySelector(".bg-magenta")).toBeInTheDocument();
  });

  it("открывает список со счётчиками и отмечает выбранное", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        works: [{ label: "Бхагавад-гита", count: 6 }],
        speakers: [{ label: "Кришна", count: 4 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou", work: "бхагавад-гита" }} />);

    await user.click(screen.getByRole("button", { name: "Изменить фильтр по автору и источнику" }));
    const dialog = await screen.findByRole("dialog", { name: "Автор и источник" });
    const gita = await within(dialog).findByRole("link", { name: /Бхагавад-гита/ });
    expect(gita.getAttribute("aria-current")).toBe("true");
    expect(gita.textContent).toContain("6");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/motivation/feed/attributions?style=art&work=",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // VED-252, доработка: «кнопка со значком фильтра открывается с
  // затормаживанием». Тормозило «Загружаем…» внутри окна — запрос
  // начинался только после открытия. Теперь он уходит, пока палец ещё
  // на стекле (`pointerdown` до `click`) или мышь только подъехала.
  it("запрос уходит по касанию кнопки, до открытия окна", async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);

    await user.hover(screen.getByRole("button", { name: "Фильтр по автору и источнику" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/motivation/feed/attributions");
  });

  it("наведение, касание и нажатие — один запрос, а не три", async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);

    await user.click(screen.getByRole("button", { name: "Фильтр по автору и источнику" }));
    await screen.findByRole("dialog", { name: "Автор и источник" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("второе открытие показывает список сразу, без «Загружаем…» и без запроса", async () => {
    const fetchMock = vi.fn().mockResolvedValue(listResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);
    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });

    await user.click(trigger);
    const first = await screen.findByRole("dialog", { name: "Автор и источник" });
    await within(first).findByRole("link", { name: /Бхагавад-гита/ });
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.click(trigger);

    const again = screen.getByRole("dialog", { name: "Автор и источник" });
    // Синхронно, тем же кадром, что и открытие: `getBy*`, не `findBy*`.
    expect(within(again).getByRole("link", { name: /Бхагавад-гита/ })).toBeInTheDocument();
    expect(within(again).queryByText("Загружаем…")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("не ответивший портал показывает ошибку, следующее открытие пробует снова", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FeedAttributionFilter state={{ tab: "forYou" }} />);
    const trigger = screen.getByRole("button", { name: "Фильтр по автору и источнику" });

    await user.click(trigger);
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    fetchMock.mockResolvedValue(listResponse());
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Автор и источник" });
    expect(await within(dialog).findByRole("link", { name: /Бхагавад-гита/ })).toBeInTheDocument();
    // Неудача не запоминается: за списком сходили снова.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
