import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { SwipeDeck } from "./swipe-deck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("./union-boost-button", () => ({
  UnionBoostButton: () => <div data-testid="boost-button" />,
}));

function recommendation(
  overrides: {
    user?: Partial<UnionRecommendation["user"]>;
    profile?: Partial<UnionRecommendation["profile"]>;
  } = {},
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
      isVerifiedDevotee: false,
      isPhotoVerified: false,
      contacts: null,
      ...overrides.user,
    },
    profile: {
      about: "Рассказ о себе",
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
      ...overrides.profile,
    },
    compatibility: { total: 85, breakdown: [] },
    connection: null,
  };
}

describe("SwipeDeck card", () => {
  it("shows interest chips with icons and hides the rest until expanded", async () => {
    const user = userEvent.setup();
    render(
      <SwipeDeck
        items={[
          recommendation({
            profile: {
              interests: [
                "психология",
                "путешествия",
                "музыка",
                "йога",
                "своё увлечение",
              ],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("✨ Интересы")).toBeInTheDocument();
    expect(screen.getByText("🧠 психология")).toBeInTheDocument();
    expect(screen.queryByText("✨ своё увлечение")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Развернуть анкету" }));

    // Свой вариант интереса не из справочника получает «искру».
    expect(screen.getByText("✨ своё увлечение")).toBeInTheDocument();
    expect(screen.getByText("Рассказ о себе")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Свернуть анкету" }),
    ).toBeInTheDocument();
  });

  it("renders the photo carousel when the person has public photos", () => {
    render(
      <SwipeDeck
        items={[
          recommendation({
            user: {
              photos: [
                { id: "photo-1", url: "one.webp", width: 800, height: 1200 },
                { id: "photo-2", url: "two.webp", width: 800, height: 1200 },
              ],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("recommendation-carousel")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Показать фото 2 из 2" }),
    ).toBeInTheDocument();
  });

  it("offers pass, superlike and like actions", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    for (const label of ["Пропустить", "Суперлайк", "Познакомиться"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Вернуть предыдущую анкету" }),
    ).toBeDisabled();
  });
});
