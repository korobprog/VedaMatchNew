import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import { Header, isCurrentRoute } from "./header";
import { SERVICE_CONTENT } from "@/lib/service-content";
import ru from "../../messages/ru.json";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => <a href="/notifications">Колокольчик</a>,
}));
vi.mock("@/components/market/cart-badge", () => ({ CartBadge: () => null }));
vi.mock("@/components/locale-toggle", () => ({ LocaleToggle: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
// framer-motion: без анимаций, чтобы drawer появлялся и исчезал сразу.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const passthrough = (tag: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.forwardRef(function Motion(props: any, ref) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { initial, animate, exit, transition, whileInView, viewport, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { div: passthrough("div"), span: passthrough("span") },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const user = {
  id: "u1",
  displayName: "Радха",
  avatarUrl: null,
  role: "user",
  adminServices: [],
} as unknown as UserProfile;

describe("isCurrentRoute", () => {
  it("matches the home route exactly and services by prefix", () => {
    expect(isCurrentRoute("/", "/")).toBe(true);
    expect(isCurrentRoute("/union", "/")).toBe(false);
    expect(isCurrentRoute("/union/chats/1", "/union")).toBe(true);
    expect(isCurrentRoute("/unions", "/union")).toBe(false);
  });
});

/** Шапка берёт подписи из next-intl — рендерим с настоящими русскими сообщениями. */
function renderHeader() {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <Header user={user} />
    </NextIntlClientProvider>,
  );
}

/** Меню открывается плиткой «Меню» в панели горячих кнопок (VED-402). */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Горячие кнопки" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Горячие кнопки" })).getByRole(
      "button",
      { name: "Меню" },
    ),
  );
  return screen.getByRole("dialog", { name: "Меню" });
}

describe("Header", () => {
  beforeEach(() => {
    pathname = "/notices/my";
    window.localStorage.clear();
  });

  it("lists every service from service-content and marks the current one", () => {
    renderHeader();
    const nav = screen.getAllByRole("navigation", { name: "Сервисы" })[0];
    for (const service of SERVICE_CONTENT) {
      expect(
        nav.querySelector(`a[href="${service.route}"]`),
        service.route,
      ).not.toBeNull();
    }
    expect(nav.querySelector('a[href="/notices"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.querySelector('a[href="/union"]')).not.toHaveAttribute(
      "aria-current",
    );
  });

  // VED-15: панель открывают ради сервисов, поэтому «Главная» стоит первой,
  // за ней сервисы, и только потом служебное — админка и «Добавить новость».
  it("ставит «Главную» и сервисы выше админских ссылок", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <Header user={{ ...user, role: "admin" } as unknown as UserProfile} />
      </NextIntlClientProvider>,
    );
    const dialog = openMenu();

    const links = [...dialog.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    const home = links.indexOf("/");
    const lastService = links.indexOf(
      SERVICE_CONTENT[SERVICE_CONTENT.length - 1].route,
    );
    const admin = links.indexOf("/admin");

    expect(home).toBe(0);
    expect(lastService).toBeGreaterThan(home);
    expect(admin).toBeGreaterThan(lastService);
    expect(links.indexOf("/admin/changelog?new=1")).toBeGreaterThan(lastService);
  });

  it("opens the drawer as a dialog, closes it on Escape and returns focus", async () => {
    renderHeader();
    const star = screen.getByRole("button", { name: "Горячие кнопки" });

    const dialog = openMenu();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe("");
    // Плитки «Меню» уже нет — фокус возвращается на звёздочку панели.
    expect(document.activeElement).toBe(star);
  });

  /* VED-412: «Оставь на верхней панели две кнопки как раньше — звёздочка и
     колокольчик. А также верни в самую правую клавишу Меню». */
  it("по умолчанию в шапке звёздочка, колокольчик, аватар и самым правым «Меню»", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "История" })).toBeNull();
    const star = screen.getByRole("button", { name: "Горячие кнопки" });
    const bell = screen.getByRole("link", { name: "Колокольчик" });
    const avatar = screen.getByRole("link", { name: "Р" });
    const menu = screen.getByRole("button", { name: "Меню" });
    const order = [star, bell, avatar, menu];
    for (let i = 1; i < order.length; i += 1)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("«Меню» в шапке открывает меню и получает фокус обратно", async () => {
    renderHeader();
    const menu = screen.getByRole("button", { name: "Меню" });
    fireEvent.click(menu);
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeInTheDocument();
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(document.activeElement).toBe(menu);
  });

  it("тап по подложке закрывает меню кликом, а не касанием", () => {
    renderHeader();
    openMenu();
    const backdrop = screen.getByTestId("drawer-backdrop");
    // Палец коснулся подложки — меню ещё на месте: иначе остаток касания
    // доставался бы странице под ним (VED-408).
    fireEvent.touchStart(backdrop, { touches: [{ clientX: 380, clientY: 300 }] });
    fireEvent.mouseDown(backdrop);
    expect(screen.getByRole("dialog", { name: "Меню" })).toBeInTheDocument();
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Меню" })).not.toBeInTheDocument();
  });

  it("подложка накрывает и шапку: за пределами меню ничего не нажимается", () => {
    renderHeader();
    openMenu();
    const backdrop = screen.getByTestId("drawer-backdrop");
    // Шапка — `z-50`, подложка и панель выше неё.
    expect(backdrop.className).toContain("z-[60]");
    expect(screen.getByRole("dialog", { name: "Меню" }).className).toContain(
      "z-[60]",
    );
  });
});

/* VED-408: настройка бокового меню — прятать сервисы, добавлять горячие
   кнопки и переставлять то и другое. */
// Длинные списки настройки: `getByRole` с именем перебирает их целиком, и
// под нагрузкой машины тест не укладывается в стандартные 5 с.
describe("Header: настройка меню", { timeout: 20000 }, () => {
  beforeEach(() => {
    pathname = "/notices/my";
    window.localStorage.clear();
  });

  const serviceLinks = (dialog: HTMLElement) =>
    [...dialog.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));

  it("кнопка настройки стоит в строке «Главной», слева от крестика", () => {
    renderHeader();
    const dialog = openMenu();
    const tune = within(dialog).getByRole("button", { name: "Настроить меню" });
    const close = within(dialog).getByRole("button", { name: "Закрыть меню" });
    expect(tune.nextElementSibling).toBe(close);
    expect(tune).toHaveAttribute("aria-pressed", "false");
  });

  it("прячет сервис, добавляет горячую кнопку и переставляет их", () => {
    renderHeader();
    let dialog = openMenu();
    const first = SERVICE_CONTENT[0];
    const second = SERVICE_CONTENT[1];

    fireEvent.click(within(dialog).getByRole("button", { name: "Настроить меню" }));
    // Спрятать первый сервис.
    fireEvent.click(
      within(dialog).getByRole("switch", {
        name: new RegExp(first.name),
      }),
    );
    // Добавить «Поиск» — встаёт в конец — и поднять его на шаг.
    fireEvent.click(within(dialog).getByRole("switch", { name: /^Поиск/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Выше: Поиск" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Готово" }));

    let links = serviceLinks(dialog);
    expect(links).not.toContain(first.route);
    expect(links[1]).toBe(second.route);
    expect(links.at(-2)).toBe("/search");
    expect(links.at(-1)).toBe(SERVICE_CONTENT.at(-1)!.route);

    // Настройка живёт между заходами.
    fireEvent.keyDown(document, { key: "Escape" });
    dialog = openMenu();
    links = serviceLinks(dialog);
    expect(links).not.toContain(first.route);
    expect(links.at(-2)).toBe("/search");
  });

  it("служебные ссылки на время настройки убраны, после — на месте", () => {
    renderHeader();
    const dialog = openMenu();
    fireEvent.click(within(dialog).getByRole("button", { name: "Настроить меню" }));
    expect(within(dialog).queryByRole("link", { name: /Что нового/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Готово" }));
    expect(within(dialog).getByRole("link", { name: /Что нового/ })).toBeInTheDocument();
  });

  it("горячая кнопка со шторкой открывает её в панели и закрывает меню", () => {
    window.localStorage.setItem(
      "vedamatch:side-menu",
      JSON.stringify({ v: 1, ids: ["history"], hidden: [] }),
    );
    renderHeader();
    const dialog = openMenu();
    fireEvent.click(within(dialog).getByRole("button", { name: "История" }));
    expect(screen.queryByRole("dialog", { name: "Меню" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "История" })).toBeInTheDocument();
  });
});

/* VED-412, VED-434: настройка верхней панели — из панели горячих кнопок и
   из настройки меню. */
describe("Header: верхняя панель", { timeout: 20000 }, () => {
  beforeEach(() => {
    pathname = "/notices/my";
    window.localStorage.clear();
  });

  function openHeaderSettings() {
    fireEvent.click(screen.getByRole("button", { name: "Горячие кнопки" }));
    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Настроить верхнюю панель" }),
    );
    return screen.getByRole("dialog", { name: "Верхняя панель" });
  }

  it("кнопка настройки стоит в заголовке панели слева от шестерёнки", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Горячие кнопки" }));
    const panel = screen.getByRole("dialog", { name: "Горячие кнопки" });
    const header = within(panel).getByRole("button", {
      name: "Настроить верхнюю панель",
    });
    expect(header.nextElementSibling).toBe(
      within(panel).getByRole("button", { name: "Настроить панель" }),
    );
  });

  it("убирает «Меню», ставит «Поиск» и помнит выбор", () => {
    renderHeader();
    const settings = openHeaderSettings();
    fireEvent.click(within(settings).getByRole("switch", { name: /^Меню/ }));
    fireEvent.click(within(settings).getByRole("switch", { name: /^Поиск/ }));

    // «Меню» осталось только в заголовке открытой панели (VED-434).
    const menus = screen.getAllByRole("button", { name: "Меню" });
    expect(menus).toHaveLength(1);
    expect(settings.contains(menus[0])).toBe(true);
    const search = screen.getByRole("link", { name: "Поиск" });
    expect(search).toHaveAttribute("href", "/search");
    expect(
      JSON.parse(window.localStorage.getItem("vedamatch:header-toolbar")!),
    ).toEqual({ v: 1, ids: ["hotkeys", "search", "bell", "avatar"] });

    // Звёздочка осталась одна из двух входов — её галочку не снять.
    const star = within(settings).getByRole("switch", { name: /^Горячие кнопки/ });
    expect(star).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(star);
    expect(screen.getByRole("button", { name: "Горячие кнопки" })).toBeInTheDocument();
  });

  /* VED-456: «Сбросить по умолчанию» — значком в заголовке настройки
     верхней панели, возвращает шапку как была. */
  it("сбрасывает верхнюю панель по умолчанию одним нажатием", () => {
    renderHeader();
    const settings = openHeaderSettings();
    fireEvent.click(within(settings).getByRole("switch", { name: /^Поиск/ }));
    expect(screen.getByRole("link", { name: "Поиск" })).toBeInTheDocument();

    fireEvent.click(
      within(settings).getByRole("button", {
        name: "Сбросить верхнюю панель по умолчанию",
      }),
    );

    expect(screen.queryByRole("link", { name: "Поиск" })).not.toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem("vedamatch:header-toolbar")!).ids,
    ).toEqual(["hotkeys", "bell", "avatar", "menu"]);
  });

  it("колокольчик и аватар закреплены", () => {
    renderHeader();
    const settings = openHeaderSettings();
    for (const name of [/^Уведомления/, /^Профиль/])
      expect(within(settings).getByRole("switch", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
  });

  it("звёздочка возвращается в шапку, даже если её убрали раньше (VED-412)", () => {
    window.localStorage.setItem(
      "vedamatch:header-toolbar",
      JSON.stringify({ v: 1, ids: ["bell", "avatar", "menu"] }),
    );
    renderHeader();
    expect(screen.getByRole("button", { name: "Горячие кнопки" })).toBeInTheDocument();
  });

  it("настройка шапки открывается и из настройки меню", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Меню" }));
    const dialog = screen.getByRole("dialog", { name: "Меню" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Настроить меню" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Настроить верхнюю панель" }),
    );
    expect(screen.queryByRole("dialog", { name: "Меню" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Верхняя панель" })).toBeInTheDocument();
  });
});

/*
 * VED-191: меню выдвигается свайпом от края — справа влево и слева вправо —
 * и появляется мгновенно.
 */
describe("Header: свайп от края", () => {
  const width = 412;

  beforeEach(() => {
    pathname = "/notices/my";
    vi.stubGlobal("innerWidth", width);
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function swipe(from: [number, number], to: [number, number], target: Element = document.body) {
    const at = ([clientX, clientY]: [number, number]) => [{ clientX, clientY }];
    fireEvent.touchStart(target, { touches: at(from) });
    // Два шага, как настоящий палец: первый ещё в пределах дрожания.
    const mid: [number, number] = [
      from[0] + Math.sign(to[0] - from[0]) * 5,
      from[1] + Math.sign(to[1] - from[1]) * 2,
    ];
    fireEvent.touchMove(target, { touches: at(mid) });
    fireEvent.touchMove(target, { touches: at(to) });
    fireEvent.touchEnd(target, { touches: [] });
  }

  it("от правого края влево — меню справа, сразу, без выезда", () => {
    renderHeader();
    swipe([width - 4, 300], [width - 90, 305]);

    const dialog = screen.getByRole("dialog", { name: "Меню" });
    expect(dialog).toHaveAttribute("data-side", "right");
    expect(dialog.className).toContain("right-0");
    // Мгновенно: ни трансформа, ни перехода на самой панели.
    expect(dialog.style.transform).toBe("");
    expect(dialog.className).not.toMatch(/transition|animate/);
  });

  it("от левого края вправо — то же меню слева, и мазком обратно оно закрывается", () => {
    renderHeader();
    swipe([3, 300], [90, 300]);

    const dialog = screen.getByRole("dialog", { name: "Меню" });
    expect(dialog).toHaveAttribute("data-side", "left");
    expect(dialog.className).toContain("left-0");
    // То же содержимое: все сервисы на месте.
    for (const service of SERVICE_CONTENT)
      expect(
        dialog.querySelector(`a[href="${service.route}"]`),
      ).not.toBeNull();

    swipe([200, 300], [100, 302], dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /* VED-408: меню закрывается посреди мазка, а палец ещё на стекле. Хвост
     касания не должен нажать ничего на странице под ним. */
  it("после закрытия мазком хвост касания забирает заслон, а не страница", () => {
    vi.useFakeTimers();
    try {
      renderHeader();
      const pageButton = document.createElement("button");
      const pressed = vi.fn();
      pageButton.addEventListener("click", pressed);
      document.body.appendChild(pageButton);

      swipe([3, 300], [90, 300]);
      const dialog = screen.getByRole("dialog", { name: "Меню" });
      // Мазок к краю, начатый в панели и ушедший за неё.
      fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchMove(dialog, { touches: [{ clientX: 195, clientY: 301 }] });
      fireEvent.touchMove(dialog, { touches: [{ clientX: 100, clientY: 302 }] });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Меню уже нет, а над страницей — прозрачный заслон.
      const shield = screen.getByTestId("drawer-backdrop");
      expect(shield.className).not.toContain("bg-bg-0");
      fireEvent.pointerUp(shield);
      fireEvent.click(shield);
      expect(pressed).not.toHaveBeenCalled();

      // Опускается вскоре после того, как палец поднят.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByTestId("drawer-backdrop")).not.toBeInTheDocument();
      pageButton.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("вертикальная прокрутка у края и свайп из середины меню не открывают", () => {
    renderHeader();
    swipe([width - 4, 300], [width - 20, 400]);
    swipe([200, 300], [60, 300]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("карусели, которой есть куда листаться, жест уступает", () => {
    renderHeader();
    const carousel = document.createElement("div");
    carousel.style.overflowX = "auto";
    Object.defineProperty(carousel, "scrollWidth", { value: 1200 });
    Object.defineProperty(carousel, "clientWidth", { value: 412 });
    const slide = document.createElement("div");
    carousel.appendChild(slide);
    document.body.appendChild(carousel);

    swipe([width - 4, 300], [width - 90, 300], slide);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    carousel.remove();
  });

  it("на широком экране, где меню в шапке, жеста нет", () => {
    vi.stubGlobal(
      "matchMedia",
      () => ({ matches: false }) as unknown as MediaQueryList,
    );
    renderHeader();
    swipe([width - 4, 300], [width - 90, 300]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
