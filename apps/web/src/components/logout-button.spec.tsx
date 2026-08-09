import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./logout-button";
import { deleteVedabaseDb } from "@/lib/vedabase/local-db";
import { clearOfflineCaches } from "@/lib/pwa/service-worker";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/lib/vedabase/local-db", () => ({
  deleteVedabaseDb: vi.fn(),
}));

const unsubscribe = vi.fn(async () => true);

vi.mock("@/lib/pwa/push-subscription", () => ({
  currentSubscription: vi.fn(async () => ({
    endpoint: "https://push.example/a",
    unsubscribe,
  })),
}));

vi.mock("@/lib/notifications-api", () => ({
  removeSubscription: vi.fn(async () => undefined),
}));

vi.mock("@/lib/pwa/service-worker", () => ({
  clearOfflineCaches: vi.fn(),
  activeUserKey: "vedabase:activeUserId",
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
    vi.mocked(deleteVedabaseDb).mockReset();
    vi.mocked(clearOfflineCaches).mockReset();
    localStorage.clear();
  });

  it("logs out through the API, clears local data, and opens the landing page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    localStorage.setItem("vedabase:activeUserId", "user-1");

    render(<LogoutButton>Выйти из аккаунта</LogoutButton>);
    fireEvent.click(screen.getByRole("button", { name: "Выйти из аккаунта" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/auth/logout",
        { method: "POST", credentials: "include" },
      );
      expect(clearOfflineCaches).toHaveBeenCalledOnce();
      expect(deleteVedabaseDb).toHaveBeenCalledWith("user-1");
      expect(replace).toHaveBeenCalledWith("/");
      expect(refresh).toHaveBeenCalledOnce();
    });
    expect(localStorage.getItem("vedabase:activeUserId")).toBeNull();
  });

  it("снимает пуш-подписку устройства при выходе", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const { removeSubscription } = await import("@/lib/notifications-api");

    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => {
      expect(removeSubscription).toHaveBeenCalledWith("https://push.example/a");
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

  it("shows an error and stays on the page when logout fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    expect(
      await screen.findByText("Не удалось выйти. Попробуйте ещё раз."),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
