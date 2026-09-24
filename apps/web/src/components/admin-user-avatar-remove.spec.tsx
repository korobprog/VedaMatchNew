import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUserAvatarRemove } from "./admin-user-avatar-remove";
import { apiFetch } from "@/lib/http-client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/http-client", () => ({ apiFetch: vi.fn() }));

describe("AdminUserAvatarRemove (VED-471)", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    refresh.mockReset();
  });

  it("без фото удалять нечего", () => {
    render(<AdminUserAvatarRemove userId="u-1" avatarUrl={null} />);
    expect(screen.getByText("Фото профиля не загружено.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("удаляет после подтверждения и передаёт пояснение", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue(new Response("{}"));
    render(<AdminUserAvatarRemove userId="u-1" avatarUrl="https://cdn/a.webp" />);

    await user.type(
      screen.getByLabelText(/Пояснение для человека/),
      "На фото другой человек",
    );
    await user.click(screen.getByRole("button", { name: "Удалить фото профиля" }));

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/users/u-1/avatar/remove"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "На фото другой человек" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("без подтверждения ничего не отправляет", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminUserAvatarRemove userId="u-1" avatarUrl="https://cdn/a.webp" />);

    await user.click(screen.getByRole("button", { name: "Удалить фото профиля" }));

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("говорит об ошибке сервера", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(apiFetch).mockResolvedValue(
      new Response("Доступ только для администратора", { status: 403 }),
    );
    render(<AdminUserAvatarRemove userId="u-1" avatarUrl="https://cdn/a.webp" />);

    await user.click(screen.getByRole("button", { name: "Удалить фото профиля" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Доступ только для администратора",
    );
  });
});
