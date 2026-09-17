import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedAttributionFilter } from "./feed-attribution-filter";

afterEach(() => vi.unstubAllGlobals());

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
});
