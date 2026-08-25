import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationCard } from "./recommendation-card";

vi.mock("./connection-actions", () => ({
  ConnectionActions: () => <div data-testid="connection-actions" />,
}));

vi.mock("./report-block-menu", () => ({
  ReportBlockMenu: () => <div data-testid="report-block-menu" />,
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
      age: 28,
      activity: "online",
      lastSeenAt: null,
      isVerifiedDevotee: false,
      isPhotoVerified: false,
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
      status: null,
      heightCm: null,
      diet: null,
      regulativePrinciples: [],
      childrenStatus: null,
      education: null,
      spiritualEducation: null,
      housing: null,
      income: null,
      pets: [],
      ageRangeMin: null,
      ageRangeMax: null,
      intentions: [],
    },
    compatibility: { total: 85, breakdown: [] },
    connection: null,
  };
}

describe("RecommendationCard verified devotee badge", () => {
  it("shows the badge only for administration-confirmed devotees", () => {
    const { rerender } = render(
      <RecommendationCard item={recommendation({ isVerifiedDevotee: false })} />,
    );
    expect(screen.queryByTestId("verified-devotee-badge")).not.toBeInTheDocument();

    rerender(
      <RecommendationCard item={recommendation({ isVerifiedDevotee: true })} />,
    );
    expect(screen.getByTestId("verified-devotee-badge")).toBeInTheDocument();
  });
});

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

  /**
   * Превью «как вас видят» — та же карточка, показанная человеку про него
   * самого. Совместимость с собой бессмысленна, а связаться с собой нельзя.
   */
  it("в режиме превью снимает процент и действия", () => {
    render(<RecommendationCard item={recommendation()} preview />);

    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Почему \d+%/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Проверить совместимость по звёздам"),
    ).not.toBeInTheDocument();
  });

  it("без превью процент на месте", () => {
    const item = recommendation();
    render(<RecommendationCard item={item} />);

    expect(screen.getByText(`${item.compatibility.total}%`)).toBeInTheDocument();
  });
});
