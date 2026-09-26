import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import { ProfileAvatarCard } from "./profile-avatar-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const user = {
  id: "u1",
  displayName: "Радха",
  avatarUrl: null,
} as unknown as UserProfile;

/* VED-479: выбор фото — первым на странице профиля, своей карточкой. */
describe("ProfileAvatarCard", () => {
  it("предлагает выбрать фото и не даёт сохранить, пока его нет", () => {
    render(<ProfileAvatarCard user={user} />);
    expect(
      screen.getByLabelText("Выбрать фото для аватара"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить аватар" }),
    ).toBeDisabled();
  });

  it("не принимает файл неподходящего вида", () => {
    render(<ProfileAvatarCard user={user} />);
    fireEvent.change(screen.getByLabelText("Выбрать фото для аватара"), {
      target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
    });
    expect(
      screen.getByText("Разрешены только jpg, jpeg, png и webp"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить аватар" }),
    ).toBeDisabled();
  });
});
