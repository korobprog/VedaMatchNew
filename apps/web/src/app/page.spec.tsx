import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { getProfile, getServices } from "@/lib/api";
import { getUnionConnectionCounts } from "@/lib/union-api";

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
  getServices: vi.fn(),
}));

vi.mock("@/lib/union-api", () => ({
  getUnionConnectionCounts: vi.fn(),
}));

vi.mock("@/components/landing", () => ({
  LandingPage: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="landing" data-return-to={returnTo} />
  ),
}));

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(getServices).mockResolvedValue(null);
    vi.mocked(getUnionConnectionCounts).mockResolvedValue(null);
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
});
