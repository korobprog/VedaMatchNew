import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { RecommendationTile } from "./recommendation-tile";

function item(
  overrides: Partial<UnionRecommendation["user"]> = {},
): UnionRecommendation {
  return {
    user: {
      id: "u1",
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
      ...overrides,
    },
    profile: {} as UnionRecommendation["profile"],
    compatibility: { total: 85, breakdown: [] },
    connection: null,
  };
}

describe("RecommendationTile", () => {
  it("names the person and the match so the grid is scannable", () => {
    render(<RecommendationTile item={item()} onOpen={vi.fn()} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName(expect.stringContaining("Радха"));
    expect(button).toHaveAccessibleName(expect.stringContaining("85"));
  });

  it("opens the viewer on tap", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<RecommendationTile item={item()} onOpen={onOpen} />);

    await user.click(screen.getByRole("button"));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // Плитка маленькая, лицо в ней — главное. Без фото показываем букву, а не
  // пустой прямоугольник, иначе сетка выглядит сломанной.
  it("falls back to an initial when the person has no photo", () => {
    render(<RecommendationTile item={item({ photos: [] })} onOpen={vi.fn()} />);

    expect(screen.getByText("Р")).toBeInTheDocument();
  });

  // Снимок декоративный: подпись несёт сама кнопка, поэтому alt пустой и
  // роли `img` у картинки нет — ищем по тегу, а не по роли.
  it("prefers the first public photo over the avatar", () => {
    const { container } = render(
      <RecommendationTile
        item={item({
          avatarUrl: "https://example.test/avatar.webp",
          photos: [
            {
              id: "p1",
              url: "https://example.test/photo.webp",
              width: 800,
              height: 800,
            },
          ],
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.test/photo.webp",
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
