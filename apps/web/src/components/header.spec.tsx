import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  NotificationBell: () => null,
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

describe("Header", () => {
  beforeEach(() => {
    pathname = "/notices/my";
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
    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));
    const dialog = screen.getByRole("dialog", { name: "Меню" });

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
    const burger = screen.getByRole("button", { name: "Открыть меню" });
    expect(burger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(burger);
    const dialog = screen.getByRole("dialog", { name: "Меню" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(burger).toHaveAttribute("aria-expanded", "true");
    expect(burger).toHaveAttribute("aria-controls", dialog.id);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(burger);
  });

  it("бургер при открытом меню закрывает его, а не открывает заново", () => {
    renderHeader();
    const burger = screen.getByRole("button", { name: "Открыть меню" });
    fireEvent.click(burger);
    const close = screen.getByRole("button", { name: "Закрыть меню", expanded: true });
    // Тап по бургеру — это mousedown снаружи панели и следом клик.
    fireEvent.mouseDown(close);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
