import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationCard } from "./recommendation-card";

vi.mock("./connection-actions", () => ({
  ConnectionActions: () => <div data-testid="connection-actions" />,
}));

function recommendation(
  user: Partial<UnionRecommendation["user"]> = {},
): UnionRecommendation {
  return {
    user: {
      id: "user-1",
      name: "Радха",
      avatarUrl: null,
      photos: [],
      city: "Москва",
      country: "Россия",
      spiritualStage: "seeker",
      contacts: null,
      ...user,
    },
    profile: {
      about: null,
      format: "any",
      relocationReady: false,
      languages: [],
      skills: [],
      interests: [],
      values: [],
      intentions: [],
    },
    compatibility: { total: 85, breakdown: [] },
    connection: null,
  };
}

describe("RecommendationCard photo fallback", () => {
  it("shows the gallery exclusively when public photos exist", () => {
    render(
      <RecommendationCard
        item={recommendation({
          avatarUrl: "https://example.com/avatar.webp",
          photos: [
            {
              id: "gallery-photo",
              url: "https://example.com/gallery.webp",
              width: 1200,
              height: 800,
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "Радха, фото 1 из 1" })).toHaveAttribute(
      "src",
      "https://example.com/gallery.webp",
    );
    expect(screen.queryByRole("img", { name: "Радха" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("recommendation-initials")).not.toBeInTheDocument();
  });

  it("shows the avatar exclusively when no public photos exist", () => {
    render(
      <RecommendationCard
        item={recommendation({ avatarUrl: "https://example.com/avatar.webp" })}
      />,
    );

    expect(screen.getByRole("img", { name: "Радха" })).toHaveAttribute(
      "src",
      "https://example.com/avatar.webp",
    );
    expect(screen.queryByTestId("recommendation-carousel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recommendation-initials")).not.toBeInTheDocument();
  });

  it("shows initials exclusively when neither gallery nor avatar exists", () => {
    render(<RecommendationCard item={recommendation()} />);

    expect(screen.getByTestId("recommendation-initials")).toHaveTextContent("Р");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recommendation-carousel")).not.toBeInTheDocument();
  });
});
