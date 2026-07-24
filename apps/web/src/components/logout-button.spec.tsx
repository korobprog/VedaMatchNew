import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./logout-button";
import { deleteVedabaseDb } from "@/lib/vedabase/local-db";
import { clearVedabaseOfflineData } from "@/lib/vedabase/register-service-worker";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/lib/vedabase/local-db", () => ({
  deleteVedabaseDb: vi.fn(),
}));

vi.mock("@/lib/vedabase/register-service-worker", () => ({
  clearVedabaseOfflineData: vi.fn(),
  vedabaseActiveUserKey: "vedabase-active-user",
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.restoreAllMocks();
    vi.mocked(deleteVedabaseDb).mockReset();
    vi.mocked(clearVedabaseOfflineData).mockReset();
    localStorage.clear();
  });

  it("logs out through the API, clears local data, and opens the landing page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    localStorage.setItem("vedabase-active-user", "user-1");

    render(<LogoutButton>Выйти из аккаунта</LogoutButton>);
    fireEvent.click(screen.getByRole("button", { name: "Выйти из аккаунта" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/auth/logout",
        { method: "POST", credentials: "include" },
      );
      expect(clearVedabaseOfflineData).toHaveBeenCalledOnce();
      expect(deleteVedabaseDb).toHaveBeenCalledWith("user-1");
      expect(replace).toHaveBeenCalledWith("/");
      expect(refresh).toHaveBeenCalledOnce();
    });
    expect(localStorage.getItem("vedabase-active-user")).toBeNull();
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
