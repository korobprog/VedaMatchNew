import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ru from "../../../messages/ru.json";
import { QuickPanel } from "./quick-panel";
import { resetPortalWindowsForTests } from "./portal-windows-store";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));

const STORAGE_KEY = "vedamatch:quick-panel";

function stubFetch(overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("/billing/donation"))
      return Promise.resolve({
        ok: true,
        json: async () => ({ enabled: false, requisites: [] }),
      });
    if (String(url).includes("/bookmarks"))
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "b1",
              path: "/music/artists/1",
              title: "Шрила Прабхупада",
              service: "music",
              createdAt: "2026-09-21T00:00:00.000Z",
            },
          ],
          limit: 200,
        }),
      });
    if (String(url).includes("/rewards/me"))
      return Promise.resolve({
        ok: true,
        json: async () => ({ link: "https://vedamatch.ru/?ref=abc" }),
      });
    return Promise.resolve({ ok: true, json: async () => overrides });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetPortalWindowsForTests();
  push.mockClear();
  replace.mockClear();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPanel({ admin = false } = {}) {
  const user = userEvent.setup();
  // Названия разделов в списке закладок приходят из каталога сервисов, а он
  // знает язык интерфейса — отсюда провайдер вокруг панели.
  render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <QuickPanel admin={admin} />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));
  return user;
}

describe("QuickPanel", () => {
  it("закрыта, пока её не открыли: панель не должна занимать экран", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <QuickPanel />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("показывает набор по умолчанию", async () => {
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(within(panel).getByRole("link", { name: /Афоризм/ })).toHaveAttribute(
      "href",
      "/motivation?order=random",
    );
    // Календарь — кнопка, а не ссылка: календарей два, и плитка открывает
    // выбор между афишей портала и вайшнавским календарём.
    expect(
      within(panel).getByRole("button", { name: /Календарь/ }),
    ).toBeInTheDocument();
  });

  it("календарь предлагает афишу портала и вайшнавский календарь", async () => {
    await openPanel();
    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    await userEvent.click(
      within(panel).getByRole("button", { name: /Календарь/ }),
    );

    expect(
      within(panel).getByRole("link", { name: "Афиша портала" }),
    ).toHaveAttribute("href", "/notices/events");
    const external = within(panel).getByRole("link", {
      name: /Вайшнавский календарь/,
    });
    expect(external).toHaveAttribute("href", "https://vcalendar.ru");
    // Без `noopener` открытая вкладка получает доступ к нашей через
    // `window.opener` — на внешних ссылках это обязательно.
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("помнит настроенный набор между заходами", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["info"]}');
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(within(panel).getByRole("button", { name: /Что нужно знать/ })).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: /Календарь/ })).not.toBeInTheDocument();
  });

  it("мусор в хранилище не ломает панель", async () => {
    window.localStorage.setItem(STORAGE_KEY, "не json");
    await openPanel();

    expect(screen.getByRole("link", { name: /Афоризм/ })).toBeInTheDocument();
  });

  it("включает кнопку в настройках и сохраняет выбор", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Калькулятор/ }));

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids,
    ).toContain("calculator");
  });

  it("выключенная кнопка уходит из панели", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Календарь/ }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByRole("link", { name: /Календарь/ })).not.toBeInTheDocument();
  });

  it("переставляет кнопки стрелками", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '{"v":2,"ids":["calendar","aphorism"]}',
    );
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("button", { name: "Выше: Афоризм" }));

    // Первые три — закреплённые (VED-326): стрелка двигает кнопку в своей
    // части списка, а не выталкивает «Пригласить» с третьего места.
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids).toEqual([
      "search",
      "donate",
      "invite",
      "aphorism",
      "calendar",
      "postcard",
    ]);
  });

  it("пустая панель говорит, что делать", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":4,"ids":[]}');
    // Опустошить панель может только админ: у остальных три кнопки
    // закреплены (VED-326), и пустой она не бывает.
    await openPanel({ admin: true });

    expect(screen.getByText(/Панель пуста/)).toBeInTheDocument();
  });

  /* VED-326, п. 6: «Поиск», «Поддержать», «Пригласить» стоят первыми и не
     выключаются. Заказчик обвёл их на скриншоте — это то, что порталу нужно
     от каждого гостя, а случайно снятую галочку никто не вернёт. */
  it("три закреплённые кнопки стоят первыми, даже если их выключали", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":4,"ids":["calendar"]}');
    stubFetch().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).includes("/billing/donation")
            ? {
                enabled: true,
                text: "",
                requisites: [{ kind: "sbp", label: "СБП", value: "+7" }],
              }
            : {},
      }),
    );
    await openPanel();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Поддержать/ })).toBeInTheDocument(),
    );

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    // Шторка доната живёт внутри своей плитки, поэтому сверяем начало строки,
    // а не её целиком.
    const tiles = within(panel)
      .getAllByRole("listitem")
      .map((item) => item.textContent?.slice(0, 10));
    expect(tiles.slice(0, 3)).toEqual(["Поиск", "Поддержать", "Пригласить"]);
  });

  it("галочка у закреплённой кнопки не снимается", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    const toggle = screen.getByRole("switch", { name: /Поиск/ });
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    await user.click(toggle);

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)?.ids ?? [
        "search",
      ],
    ).toContain("search");
  });

  it("у админа закреплений нет: панель у него рабочая", async () => {
    const user = await openPanel({ admin: true });

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Поиск/ }));

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids,
    ).not.toContain("search");
  });

  // VED-326: «Открытка» — то же, что «Афоризм», но для второй ленты.
  it("«Открытка» открывает «Открытки» вперемешку", async () => {
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(
      within(panel).getByRole("link", { name: /Открытка/ }),
    ).toHaveAttribute("href", "/motivation?tab=cards&order=random");
  });

  it("считает в калькуляторе, не уводя со страницы", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["calculator"]}');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Калькулятор/ }));
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "×" }));
    await user.click(screen.getByRole("button", { name: "6" }));
    await user.click(screen.getByRole("button", { name: "Посчитать" }));

    expect(screen.getByLabelText("Результат")).toHaveTextContent("42");
  });

  it("копирует ссылку-приглашение в буфер", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["invite"]}');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Пригласить/ }));

    // Читаем буфер обратно, а не подменяем `writeText`: `userEvent.setup()`
    // ставит свою реализацию буфера, и подменённая ей проигрывает.
    expect(await screen.findByText("Скопировано")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        "https://vedamatch.ru/?ref=abc",
      ),
    );
  });

  // VED-118, VED-163: три кнопки перемещения по порталу.
  // VED-326: на кнопке название места, а не номер окна.
  it("кнопка окна показывает, что осталось во втором окне", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["window"]}');
    const user = await openPanel();

    const button = screen.getByRole("button", { name: /Перейти в окно 2/ });
    expect(button).toHaveTextContent("Новое окно");

    await user.click(button);
    // Второе окно ещё не открывали — оно начинает с главной. `replace`, а не
    // `push`: переключение окна не должно оставлять запись в истории
    // браузера, иначе аппаратная кнопка «назад» уводит в соседнее окно
    // (VED-354).
    expect(replace).toHaveBeenCalledWith("/");
    expect(push).not.toHaveBeenCalled();
  });

  it("закладки открываются списком и ведут на страницу", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["bookmarks"]}');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Закладки/ }));

    // Одной строкой: сначала имя закладки, потом раздел (VED-326).
    const link = await screen.findByRole("link", { name: /Шрила Прабхупада/ });
    expect(link).toHaveAttribute("href", "/music/artists/1");
    expect(link).toHaveTextContent("Музыка");
  });

  // VED-345: горячая кнопка из закладки.
  it("делает из закладки горячую кнопку и убирает её крестиком", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["bookmarks"]}');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /^Закладки/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Создать горячую клавишу: Шрила Прабхупада",
      }),
    );

    // Кнопка сразу в панели: её заводят, чтобы ею пользоваться.
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(saved.ids).toContain("custom:/music/artists/1");
    expect(saved.custom).toEqual([
      { label: "Шрила Прабхупада", href: "/music/artists/1" },
    ]);
    // Убирается через настройки — совсем, а не галочкой.
    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(
      screen.getByRole("button", {
        name: "Удалить из панели горячих клавиш: Шрила Прабхупада",
      }),
    );
    const after = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(after.ids).not.toContain("custom:/music/artists/1");
    expect(after.custom).toEqual([]);
  });

  // VED-326: сервисы в выборе кнопок.
  it("в выбор попадают все сервисы портала", async () => {
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: "Настроить панель" }));
    await user.click(screen.getByRole("switch", { name: /Работа/ }));

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids,
    ).toContain("service:work");
  });

  it("сервисная кнопка ведёт в сервис", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '{"v":3,"ids":["service:work"],"custom":[]}',
    );
    await openPanel();

    expect(screen.getByRole("link", { name: /Работа/ })).toHaveAttribute(
      "href",
      "/work",
    );
  });

  it("выключенного сервиса в панели нет, но она не падает", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      '{"v":3,"ids":["service:work","custom:/нет-такой"],"custom":[]}',
    );
    await openPanel();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /нет-такой/ })).not.toBeInTheDocument();
  });

  // VED-326: номер окна в заголовке больше не нужен.
  it("в заголовке панели нет номера окна", async () => {
    await openPanel();

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(within(panel).queryByText(/^Окно \d$/)).not.toBeInTheDocument();
  });

  it("поиск по порталу — ссылка на страницу выдачи", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["search"]}');
    await openPanel();

    expect(screen.getByRole("link", { name: /Поиск/ })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  it("выключенные пожертвования не рисуют кнопку доната", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":4,"ids":["donate"]}');
    await openPanel({ admin: true });

    // Так же, как везде на портале: реквизитов нет — кнопки нет.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Поддержать/ })).not.toBeInTheDocument(),
    );
  });
});
