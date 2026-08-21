import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
