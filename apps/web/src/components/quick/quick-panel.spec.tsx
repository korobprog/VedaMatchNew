import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ru from "../../../messages/ru.json";
import { createRef } from "react";
import { QuickPanel, type QuickPanelHandle } from "./quick-panel";
import { resetDonationSettings } from "@/lib/donation-settings";
import { resetPortalWindowsForTests } from "./portal-windows-store";
import { noteNavigationHistory } from "./navigation-history-store";

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
  // Настройки пожертвований помнятся на весь сеанс страницы (VED-380), а у
  // теста сеанс свой: иначе ответ одного доезжает до следующего.
  resetDonationSettings();
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
      // VED-402: «Меню» доехало до старой записи сразу за закреплёнными.
      "menu",
      "aphorism",
      "calendar",
      "postcard",
      "history",
    ]);
  });

  it("пустая панель говорит, что делать", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":[]}');
    // Опустошить панель может только админ: у остальных три кнопки
    // закреплены (VED-326), и пустой она не бывает.
    await openPanel({ admin: true });

    expect(screen.getByText(/Панель пуста/)).toBeInTheDocument();
  });

  /* VED-326, п. 6: «Поиск», «Поддержать», «Пригласить» стоят первыми и не
     выключаются. Заказчик обвёл их на скриншоте — это то, что порталу нужно
     от каждого гостя, а случайно снятую галочку никто не вернёт. */
  it("три закреплённые кнопки стоят первыми, даже если их выключали", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["calendar"]}');
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

  /* VED-392: «История» — сервис один раз в начале строки, ступени за ним в
     ту же строку, каждое звено ведёт назад. */
  it("история складывает ступени одного сервиса в одну строку", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["history"]}');
    for (const url of ["/music/playlists", "/work", "/work/boards/1", "/work/agenda"])
      noteNavigationHistory(url);
    const user = await openPanel();

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /^История/ }),
    );

    const list = screen.getByRole("list", { name: "История перемещений" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // Новые — сверху; сервис назван один раз, первым.
    expect(rows[0]).toHaveTextContent("Работа·Доска·Повестка");
    expect(within(rows[0]).getByRole("link", { name: "Работа" })).toHaveAttribute(
      "href",
      "/work",
    );
    expect(
      within(rows[0]).getByRole("link", { name: "Работа · Повестка" }),
    ).toHaveAttribute("href", "/work/agenda");
    expect(rows[1]).toHaveTextContent("Музыка·Плейлисты");
  });

  it("история стирается кнопкой и говорит, что пусто", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["history"]}');
    noteNavigationHistory("/work/agenda");
    const user = await openPanel();

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /^История/ }),
    );
    await user.click(screen.getByRole("button", { name: "Очистить историю" }));

    expect(screen.getByText(/Пока пусто/)).toBeInTheDocument();
    expect(window.localStorage.getItem("vedamatch:navigation-history")).toBeNull();
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
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["donate"]}');
    await openPanel({ admin: true });

    // Так же, как везде на портале: реквизитов нет — кнопки нет.
    await waitFor(() =>
      expect(screen.queryByText("Поддержать")).not.toBeInTheDocument(),
    );
  });

  /* VED-380. Заказчик заметил, что «Поддержать» появляется с запаздыванием:
     плитка ходила за реквизитами сама и до ответа не рисовала ничего.
     Реквизиты нужны шторке, а не плитке, — и пока ответа нет, плитка стоит
     на месте и ведёт на /donate, ту же страницу с реквизитами. */
  it("плитка «Поддержать» стоит в панели, не дожидаясь сервера", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["donate"]}');
    // Сервер молчит навсегда: именно это и было видно как запаздывание.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );

    await openPanel({ admin: true });

    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(
      within(panel).getByRole("link", { name: /Поддержать/ }),
    ).toHaveAttribute("href", "/donate");
  });

  it("ответ сервера помнится на весь сеанс: второе открытие не ждёт", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["donate"]}');
    const fetchMock = stubFetch();
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("/billing/donation")
        ? Promise.resolve({
            ok: true,
            json: async () => ({
              enabled: true,
              text: "",
              requisites: [{ kind: "sbp", label: "СБП", value: "+7" }],
            }),
          })
        : Promise.resolve({ ok: true, json: async () => ({}) }),
    );

    const user = await openPanel({ admin: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Поддержать/ })).toBeInTheDocument(),
    );
    const asked = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/billing/donation"),
    ).length;

    // Закрыли и открыли снова: кнопка на месте сразу, нового запроса нет.
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));

    expect(screen.getByRole("button", { name: /Поддержать/ })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/billing/donation"),
      ),
    ).toHaveLength(asked);
  });
});

/* VED-402: кнопка «История» в шапке слева от звёздочки и плитка «Меню»
   вместо бургера. */
describe("QuickPanel: «История» в шапке и плитка «Меню»", () => {
  function renderPanel(props: {
    onOpenMenu?: (trigger: HTMLElement | null) => void;
    ref?: React.Ref<QuickPanelHandle>;
  } = {}) {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <QuickPanel {...props} />
      </NextIntlClientProvider>,
    );
    return user;
  }

  it("«История» стоит слева от звёздочки и открывает одну историю, без плиток", async () => {
    noteNavigationHistory("/work/agenda");
    const user = renderPanel();

    const history = screen.getByRole("button", { name: "История" });
    const star = screen.getByRole("button", { name: "Горячие кнопки" });
    // Слева — значит раньше в порядке документа: ряд идёт слева направо.
    expect(
      history.compareDocumentPosition(star) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(history);
    const dialog = screen.getByRole("dialog", { name: "История" });
    expect(history).toHaveAttribute("aria-expanded", "true");
    expect(
      within(dialog).getByRole("list", { name: "История перемещений" }),
    ).toBeInTheDocument();
    // Плиток нет: просили историю, а не сетку, под которой её надо искать.
    expect(within(dialog).queryByRole("link", { name: /Афоризм/ })).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Настроить панель" }),
    ).toBeNull();

    // Второе нажатие закрывает, а не открывает заново.
    await user.click(history);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("звёздочка после истории открывает плитки", async () => {
    const user = renderPanel();
    await user.click(screen.getByRole("button", { name: "История" }));
    await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));
    expect(
      screen.getByRole("dialog", { name: "Горячие кнопки" }),
    ).toBeInTheDocument();
  });

  it("шторку открывают и снаружи — из бокового меню", async () => {
    const ref = createRef<QuickPanelHandle>();
    renderPanel({ ref });
    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current!.openSheet("bookmarks");
    expect(
      await screen.findByRole("dialog", { name: "Закладки" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Шрила Прабхупада/ }),
    ).toBeInTheDocument();
  });

  it("плитка «Меню» закрывает панель и просит шапку открыть меню", async () => {
    const onOpenMenu = vi.fn();
    const user = renderPanel({ onOpenMenu });
    const star = screen.getByRole("button", { name: "Горячие кнопки" });
    await user.click(star);

    // В первом ряду, сразу за тремя закреплёнными.
    const dialog = screen.getByRole("dialog", { name: "Горячие кнопки" });
    const tiles = within(dialog).getAllByRole("listitem");
    expect(tiles[3]).toHaveTextContent("Меню");

    await user.click(within(dialog).getByRole("button", { name: "Меню" }));
    expect(onOpenMenu).toHaveBeenCalledWith(star);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Меню» не выключается, но переставляется", async () => {
    const user = renderPanel({ onOpenMenu: vi.fn() });
    await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));
    await user.click(screen.getByRole("button", { name: "Настроить панель" }));

    const menu = screen.getByRole("switch", { name: /Меню/ });
    expect(menu).toHaveAttribute("aria-disabled", "true");
    expect(menu).toHaveTextContent("Всегда в панели");
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "Ниже: Меню" }));
    const ids = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids;
    expect(ids.slice(0, 5)).toEqual(["search", "donate", "invite", "window", "menu"]);
  });
});

/* VED-399: закладки листаются, а название страницы стоит в кнопке. */
describe("QuickPanel: закладки на телефоне", () => {
  it("панель не длиннее экрана и листается сама", async () => {
    await openPanel();
    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    expect(panel.className).toContain("overflow-y-auto");
    expect(panel.className).toMatch(/max-h-\[calc\(100dvh/);
  });

  it("название страницы — в кнопке «Добавить/Убрать», а не строкой под ней", async () => {
    document.title = "Dj Mpeg Alex — VedaMatch";
    window.localStorage.setItem(STORAGE_KEY, '{"v":5,"ids":["bookmarks"]}');
    const user = await openPanel();
    await user.click(screen.getByRole("button", { name: /Закладки/ }));

    const add = await screen.findByRole("button", {
      name: /Добавить эту страницу.*Dj Mpeg Alex/,
    });
    expect(add).toBeInTheDocument();
    // Строки с названием под кнопкой больше нет — только в самой кнопке.
    expect(screen.getAllByText("Dj Mpeg Alex")).toHaveLength(1);
    // И своей прокрутки у списка нет: две прокрутки одна в другой.
    const list = screen.getByRole("link", { name: /Шрила Прабхупада/ }).closest("ul")!;
    expect(list.parentElement!.className).not.toMatch(/max-h|overflow/);
  });
});
