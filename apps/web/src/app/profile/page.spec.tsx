import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import ProfilePage from "./page";
import { getProfile } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
}));

vi.mock("@/components/header", () => ({
  Header: () => null,
}));

vi.mock("@/components/profile-editor", () => ({
  ProfileEditor: () => null,
}));

vi.mock("@/components/landing/Orb", () => ({
  BackgroundOrbs: () => null,
}));

vi.mock("@/components/landing/NoiseOverlay", () => ({
  NoiseOverlay: () => null,
}));

vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Выйти из аккаунта</button>,
}));

const user: UserProfile = {
  id: "user-1",
  email: "user@example.com",
  name: "Пользователь",
  avatarUrl: null,
  avatarKey: null,
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  spiritualStage: "seeker",
  devoteeVerificationStatus: null,
  lastSelfIdentificationAt: null,
};

describe("ProfilePage", () => {
  it("shows a logout button", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);

    render(await ProfilePage());

    expect(
      screen.getByRole("button", { name: "Выйти из аккаунта" }),
    ).toBeInTheDocument();
  });
});
