import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnionProfileForm } from "./union-profile-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("UnionProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: vi.fn() }),
    );
  });

  it("sends the recommendation visibility setting", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={null} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Показывать профиль в рекомендациях",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Сохранить профиль Union" }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/union\/profile$/),
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"isActive":false'),
        }),
      ),
    );
  });
});
