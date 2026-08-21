import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceCard as ServiceCardType, UserProfile } from "@vedamatch/shared";
import Home from "./page";
import { getCommunityStats, getProfile, getServices } from "@/lib/api";
import { needsSessionRestore } from "@/lib/session-marker";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
  getServices: vi.fn(),
  getBillingPlan: vi.fn().mockResolvedValue(null),
  getCommunityStats: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/union-api", () => ({
  getUnionConnectionCounts: vi.fn(),
  getUnionChats: vi.fn(),
  getUnionProfileState: vi.fn(),
  getUnionRecommendations: vi.fn(),
}));

vi.mock("@/components/landing", () => ({
  LandingPage: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="landing" data-return-to={returnTo} />
  ),
}));

vi.mock("@/components/header", () => ({
  Header: () => null,
}));

vi.mock("@/lib/session-marker", () => ({
  needsSessionRestore: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/components/session-restore", () => ({
  SessionRestore: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="session-restore" data-return-to={returnTo} />
  ),
}));

// Анимация числа уже покрыта отдельным тестом MemberCounter — здесь важно
// только то, что портал передаёт в компонент правильное значение.
vi.mock("@/components/member-counter", () => ({
  MemberCounter: ({ total }: { total: number }) => <span>{total}</span>,
}));

const user: UserProfile = {
  id: "user-1",
  email: "radha@example.com",
  name: "Радха",
  spiritualName: null,
  displayName: "Радха",
  avatarUrl: null,
  avatarKey: null,
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  adminServices: [],
  gender: "female",
  spiritualStage: "seeker",
  devoteeVerificationStatus: null,
  birthDate: null,
  age: null,
  photoVerification: { status: "none", requestedAt: null, verifiedAt: null },
  lastSelfIdentificationAt: null,
  subscription: {
    status: "trial",
    trialEndsAt: "2026-08-27T00:00:00.000Z",
    paidUntil: null,
    accessUntil: "2026-08-27T00:00:00.000Z",
    daysLeft: 30,
    note: null,
  },
  accountStatus: "active",
  pendingDeletionAt: null,
  deletionEligibleAt: null,
};

const services: ServiceCardType[] = [
  {
    id: "union",
    slug: "union",
    name: "Знакомства",
    description: "Осознанные знакомства и сотрудничество",
    iconUrl: null,
    url: "/union",
    status: "active",
    category: "community",
    requiresDevoteeVerification: false,
  },
];

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(getServices).mockResolvedValue(null);
    vi.mocked(getUnionConnectionCounts).mockResolvedValue(null);
    vi.mocked(getUnionChats).mockResolvedValue(null);
    vi.mocked(getUnionProfileState).mockResolvedValue(null);
    vi.mocked(getUnionRecommendations).mockResolvedValue(null);
    vi.mocked(getCommunityStats).mockResolvedValue(null);
    vi.mocked(needsSessionRestore).mockResolvedValue(false);
  });

  it("shows the session splash instead of the landing when the marker cookie is set", async () => {
    vi.mocked(needsSessionRestore).mockResolvedValue(true);

    render(
      await Home({ searchParams: Promise.resolve({ returnTo: "/notices" }) }),
    );

    expect(screen.getByTestId("session-restore")).toHaveAttribute(
      "data-return-to",
      "/notices",
    );
    expect(screen.queryByTestId("landing")).not.toBeInTheDocument();
  });

  it("renders the landing page for a guest", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("landing")).toBeInTheDocument();
  });

  it("passes the original destination to session restoration", async () => {
    render(
      await Home({
        searchParams: Promise.resolve({ returnTo: "/union?tab=matches" }),
      }),
    );

    expect(screen.getByTestId("landing")).toHaveAttribute(
      "data-return-to",
      "/union?tab=matches",
    );
  });

  it("shows quick-access chips on the Union card when there is activity", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getUnionConnectionCounts).mockResolvedValue({ incomingPending: 2 });
    vi.mocked(getUnionChats).mockResolvedValue({ chats: [], unreadTotal: 3 });

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("💬 3")).toBeInTheDocument();
    expect(screen.getByText("❤️ 2")).toBeInTheDocument();
  });

  it("hides the quick-access widget when there is nothing to show", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText(/💬/)).not.toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the live member count under the welcome message", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getCommunityStats).mockResolvedValue({ totalMembers: 1234 });

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Вместе нас:")).toBeInTheDocument();
    expect(screen.getByText("1234")).toBeInTheDocument();
  });

  it("hides the member count line when the stats request fails", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getCommunityStats).mockResolvedValue(null);

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("Вместе нас:")).not.toBeInTheDocument();
  });
});
