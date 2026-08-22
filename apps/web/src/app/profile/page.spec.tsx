import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import ProfilePage from "./page";
import { getProfile } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
  getBillingPlan: vi.fn().mockResolvedValue(null),
}));

// DeleteAccountSection — клиентский компонент с useRouter; в jsdom роутера нет.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
  spiritualName: null,
  about: null,
  languages: [],
  displayName: "Пользователь",
  avatarUrl: null,
  avatarKey: null,
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  adminServices: [],
  spiritualStage: "seeker",
  devoteeVerificationStatus: null,
  birthDate: null,
  age: null,
  photoVerification: { status: "none" as const, requestedAt: null, verifiedAt: null },
  lastSelfIdentificationAt: null,
  subscription: {
    status: "trial",
    trialEndsAt: "2026-08-27T00:00:00.000Z",
    paidUntil: null,
    accessUntil: "2026-08-27T00:00:00.000Z",
    daysLeft: 30,
    note: null,
  },
  gender: null,
  accountStatus: "active",
  pendingDeletionAt: null,
  deletionEligibleAt: null,
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
