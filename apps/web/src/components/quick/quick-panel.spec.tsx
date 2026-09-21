import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ru from "../../../messages/ru.json";
import { QuickPanel } from "./quick-panel";
import { resetPortalWindowsForTests } from "./portal-windows-store";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
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
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPanel() {
  const user = userEvent.setup();
  // Названия разделов в списке закладок приходят из каталога сервисов, а он
  // знает язык интерфейса — отсюда провайдер вокруг панели.
  render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <QuickPanel />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Горячие кнопки" }));
  return user;
}

describe("QuickPanel", () => {
  it("закрыта, пока её не открыли: панель не должна занимать экран", () => {
    render(<QuickPanel />);

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

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).ids).toEqual([
      "aphorism",
      "calendar",
    ]);
  });

  it("пустая панель говорит, что делать", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":[]}');
    await openPanel();

    expect(screen.getByText(/Панель пуста/)).toBeInTheDocument();
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
  it("кнопка окна показывает номер окна, куда перейдёшь", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["window"]}');
    const user = await openPanel();

    const button = screen.getByRole("button", { name: /Перейти в окно 2/ });
    expect(button).toHaveTextContent("Окно 2");

    await user.click(button);
    // Второе окно ещё не открывали — оно начинает с главной.
    expect(push).toHaveBeenCalledWith("/");
  });

  it("закладки открываются списком и ведут на страницу", async () => {
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["bookmarks"]}');
    const user = await openPanel();

    await user.click(screen.getByRole("button", { name: /Закладки/ }));

    expect(
      await screen.findByRole("link", { name: "Шрила Прабхупада" }),
    ).toHaveAttribute("href", "/music/artists/1");
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
    window.localStorage.setItem(STORAGE_KEY, '{"v":2,"ids":["donate"]}');
    await openPanel();

    // Так же, как везде на портале: реквизитов нет — кнопки нет.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Поддержать/ })).not.toBeInTheDocument(),
    );
  });
});
