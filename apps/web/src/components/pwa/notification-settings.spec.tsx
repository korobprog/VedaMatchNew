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

const всеВключены = {
  enabled: true,
  chat: true,
  connections: true,
  support: true,
  transits: true,
  market: true,
  notices: true,
  motivation: true,
  music: true,
  announcements: true,
};

vi.mock("@/lib/notifications-api", () => ({
  fetchVapidKey: vi.fn(async () => "key"),
  saveSubscription: vi.fn(async () => undefined),
  removeSubscription: vi.fn(async () => undefined),
  fetchPreferences: vi.fn(async () => ({ ...всеВключены })),
  savePreferences: vi.fn(async (patch) => ({ ...всеВключены, ...patch })),
}));

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: () => ({ mode: "unsupported", promptInstall: vi.fn() }),
}));

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks сбрасывает вызовы, но не реализацию: без этой строки
    // `mockResolvedValue` из одного теста утёк бы в следующий.
    vi.mocked(fetchPreferences).mockResolvedValue({ ...всеВключены });
  });

  it("объясняет, что уведомления заблокированы, и не пытается спросить снова", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("denied");
    render(<NotificationSettings />);

    expect(await screen.findByText(/запретили их для сайта/i)).toBeInTheDocument();
  });

  it("отказавший браузеру всё равно управляет категориями", async () => {
    // Категории гасят и колокольчик, который работает без разрешения на пуш.
    // Пока список висел на разрешении, выключить их было нечем.
    vi.mocked(detectPushSupport).mockReturnValue("denied");
    render(<NotificationSettings />);

    expect(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    ).toBeInTheDocument();
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

  it("в браузере без пушей остаётся ради колокольчика", async () => {
    vi.mocked(detectPushSupport).mockReturnValue("unsupported");
    render(<NotificationSettings />);

    expect(
      await screen.findByRole("checkbox", { name: "Сообщения" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/не умеет присылать/i)).toBeInTheDocument();
  });

  it("каждая категория из DTO имеет свой тумблер", async () => {
    // Так «Музыка» однажды и потерялась: поле есть, управлять нечем.
    vi.mocked(detectPushSupport).mockReturnValue("granted");
    render(<NotificationSettings />);

    await screen.findByRole("checkbox", { name: "Сообщения" });
    const категории = Object.keys(всеВключены).filter((k) => k !== "enabled");
    const тумблеры = screen
      .getAllByRole("checkbox")
      .filter((b) => b.getAttribute("aria-label") !== "Все уведомления");
    expect(тумблеры).toHaveLength(категории.length);
  });

  describe("общий рубильник", () => {
    it("выключается и сохраняется", async () => {
      vi.mocked(detectPushSupport).mockReturnValue("granted");
      render(<NotificationSettings />);

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Все уведомления" }),
      );

      expect(savePreferences).toHaveBeenCalledWith({ enabled: false });
    });

    it("выключённый запирает категории, но не стирает их", async () => {
      // Спрятанное выглядит как потерянное: человек должен видеть, что его
      // выбор на месте и вернётся вместе с рубильником.
      vi.mocked(detectPushSupport).mockReturnValue("granted");
      vi.mocked(fetchPreferences).mockResolvedValue({
        ...всеВключены,
        enabled: false,
        chat: false,
      });
      render(<NotificationSettings />);

      const сообщения = await screen.findByRole("checkbox", {
        name: "Сообщения",
      });
      expect(сообщения).toBeDisabled();
      expect(сообщения).not.toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Заявки и совпадения" }),
      ).toBeChecked();
      expect(screen.getByText(/не придёт ничего/i)).toBeInTheDocument();
    });

    it("при выключенном рубильнике не обещает доставку на устройство", async () => {
      vi.mocked(detectPushSupport).mockReturnValue("granted");
      vi.mocked(fetchPreferences).mockResolvedValue({
        ...всеВключены,
        enabled: false,
      });
      render(<NotificationSettings />);

      await screen.findByRole("checkbox", { name: "Все уведомления" });
      expect(screen.queryByText(/приходят и на это устройство/i)).toBeNull();
    });
  });
});
