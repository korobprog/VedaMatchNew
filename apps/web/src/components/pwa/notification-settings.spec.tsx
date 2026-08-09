import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "./notification-settings";
import { detectPushSupport } from "@/lib/pwa/push-subscription";
import { fetchPreferences, savePreferences } from "@/lib/notifications-api";

vi.mock("@/lib/pwa/push-subscription", () => ({
  detectPushSupport: vi.fn(),
  subscribePushSupport: vi.fn(() => () => undefined),
  getPushSupportServerSnapshot: vi.fn(() => "unsupported"),
  notifyPushSupportChanged: vi.fn(),
  currentSubscription: vi.fn(async () => null),
  subscribeToPush: vi.fn(),
  toSubscriptionRequest: vi.fn(() => ({
    endpoint: "e",
    keys: { p256dh: "p", auth: "a" },
  })),
}));

vi.mock("@/lib/notifications-api", () => ({
  fetchVapidKey: vi.fn(async () => "key"),
  saveSubscription: vi.fn(async () => undefined),
  removeSubscription: vi.fn(async () => undefined),
  fetchPreferences: vi.fn(async () => ({
    enabled: true,
    chat: true,
    connections: true,
    support: true,
  })),
  savePreferences: vi.fn(async (patch) => ({
    enabled: true,
    chat: true,
    connections: true,
    support: true,
    ...patch,
  })),
}));

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: () => ({ mode: "unsupported", promptInstall: vi.fn() }),
}));

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("объясняет, что уведомления заблокированы, и не пытается спросить снова", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("denied");
    render(<NotificationSettings />);

    expect(
      await screen.findByText(/запретили уведомления/i),
    ).toBeInTheDocument();
    expect(fetchPreferences).not.toHaveBeenCalled();
  });

  it("показывает три категории, когда разрешение уже выдано", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    render(<NotificationSettings />);

    expect(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Заявки и совпадения" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Поддержка" }),
    ).toBeInTheDocument();
  });

  it("сохраняет выключенную категорию на сервере", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    render(<NotificationSettings />);

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    );

    expect(savePreferences).toHaveBeenCalledWith({ chat: false });
  });

  it("ничего не показывает в браузере без поддержки пушей", () => {
    vi.mocked(detectPushSupport).mockReturnValue("unsupported");
    const { container } = render(<NotificationSettings />);

    expect(container).toBeEmptyDOMElement();
  });
});
