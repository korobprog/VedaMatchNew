import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPermissionPrompt } from "./notification-permission-prompt";
import { detectPushSupport } from "@/lib/pwa/push-subscription";
import { enablePush } from "@/lib/pwa/enable-push";
import { notificationPromptKey } from "@/lib/pwa/notification-prompt-dismissal";
import { useInstallPrompt } from "./use-install-prompt";

vi.mock("@/lib/pwa/push-subscription", () => ({
  detectPushSupport: vi.fn(),
  subscribePushSupport: vi.fn(() => () => undefined),
  getPushSupportServerSnapshot: vi.fn(() => "unsupported"),
}));

vi.mock("@/lib/pwa/enable-push", () => ({
  enablePush: vi.fn(async () => "granted"),
}));

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: vi.fn(() => ({
    mode: "unsupported",
    promptInstall: vi.fn(),
  })),
}));

describe("NotificationPermissionPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(detectPushSupport).mockReturnValue("default");
    vi.mocked(enablePush).mockResolvedValue("granted");
    vi.mocked(useInstallPrompt).mockReturnValue({
      mode: "unsupported",
      promptInstall: vi.fn(),
    });
  });

  it("предлагает включить уведомления, пока разрешение не спрашивали", () => {
    render(<NotificationPermissionPrompt />);

    expect(
      screen.getByRole("dialog", { name: "Включить уведомления" }),
    ).toBeInTheDocument();
  });

  it("не показывается, когда разрешение уже выдано", () => {
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    const { container } = render(<NotificationPermissionPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("подписывает по кнопке «Разрешить» и больше не спрашивает", async () => {
    render(<NotificationPermissionPrompt />);

    await userEvent.click(screen.getByRole("button", { name: "Разрешить" }));

    expect(enablePush).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("сообщает, когда подписаться не удалось, и оставляет окно открытым", async () => {
    vi.mocked(enablePush).mockResolvedValue("failed");
    render(<NotificationPermissionPrompt />);

    await userEvent.click(screen.getByRole("button", { name: "Разрешить" }));

    expect(
      await screen.findByText(/Не удалось включить уведомления/i),
    ).toBeInTheDocument();
  });

  it("спрашивает ещё раз после установки, если отказались в браузере", () => {
    localStorage.setItem(notificationPromptKey, "browser");
    vi.mocked(useInstallPrompt).mockReturnValue({
      mode: "installed",
      promptInstall: vi.fn(),
    });

    render(<NotificationPermissionPrompt />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("не спрашивает в браузере после отказа в браузере", () => {
    localStorage.setItem(notificationPromptKey, "browser");

    const { container } = render(<NotificationPermissionPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("не спрашивает после отказа в установленном приложении", () => {
    localStorage.setItem(notificationPromptKey, "installed");
    vi.mocked(useInstallPrompt).mockReturnValue({
      mode: "installed",
      promptInstall: vi.fn(),
    });

    const { container } = render(<NotificationPermissionPrompt />);

    expect(container).toBeEmptyDOMElement();
  });
});
