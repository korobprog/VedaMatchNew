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
  myDecision: null,
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
      screen.queryByText("Совместимость по звёздам"),
    ).not.toBeInTheDocument();
  });

  it("без превью процент на месте", () => {
    const item = recommendation();
    render(<RecommendationCard item={item} />);

    expect(screen.getByText(`${item.compatibility.total}%`)).toBeInTheDocument();
  });
});

/**
 * Сверка карт уходит в Астрологию вместе с целью: от неё зависит, какие куты
 * пойдут в расчёт. Спрашивать об этом уже на чужой странице — лишний шаг, а
 * потерять цель по дороге — значит посчитать по-сватовски то, что просили
 * посчитать для дела.
 */
describe("RecommendationCard: сверка карт по звёздам", () => {
  it("предлагает все четыре цели", () => {
    render(<RecommendationCard item={recommendation()} />);

    for (const title of [
      "Создание семьи",
      "Бизнес и проекты",
      "Дружба по интересам",
      "Совместное служение",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("передаёт выбранную цель в адрес сверки", () => {
    const item = recommendation();
    render(<RecommendationCard item={item} />);

    const link = screen
      .getAllByRole("link")
      .find((node) =>
        node.getAttribute("href")?.includes("purpose=business"),
      );
    expect(link).toHaveAttribute(
      "href",
      `/astro/compatibility?with=${item.user.id}&purpose=business`,
    );
  });

  it("подписывает потолок каждой цели — им расчёты и различаются", () => {
    render(<RecommendationCard item={recommendation()} />);

    // 36 у семьи, 24 у дела, 17 у дружбы, 15 у служения — из общей таблицы кут.
    for (const max of ["до 36", "до 24", "до 17", "до 15"]) {
      expect(screen.getByText(max)).toBeInTheDocument();
    }
  });
});
