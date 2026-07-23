import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnionPhoto } from "@vedamatch/shared";
import { RecommendationPhotoCarousel } from "./recommendation-photo-carousel";

const photos: UnionPhoto[] = [
  { id: "photo-1", url: "https://example.com/one.webp", width: 1200, height: 800 },
  { id: "photo-2", url: "https://example.com/two.webp", width: 800, height: 1200 },
  { id: "photo-3", url: "https://example.com/three.webp", width: 1000, height: 1000 },
];

describe("RecommendationPhotoCarousel", () => {
  it("preserves photo order and supports accessible arrow navigation", async () => {
    const user = userEvent.setup();
    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    expect(screen.getByRole("img", { name: "Радха, фото 1 из 3" })).toHaveAttribute(
      "src",
      photos[0].url,
    );

    await user.click(screen.getByRole("button", { name: "Следующее фото" }));
    expect(screen.getByRole("img", { name: "Радха, фото 2 из 3" })).toHaveAttribute(
      "src",
      photos[1].url,
    );

    await user.click(screen.getByRole("button", { name: "Предыдущее фото" }));
    expect(screen.getByRole("img", { name: "Радха, фото 1 из 3" })).toBeInTheDocument();
  });

  it("selects an exact photo with Russian-labelled dot buttons", async () => {
    const user = userEvent.setup();
    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    await user.click(screen.getByRole("button", { name: "Показать фото 3 из 3" }));

    expect(screen.getByRole("img", { name: "Радха, фото 3 из 3" })).toHaveAttribute(
      "src",
      photos[2].url,
    );
  });

  it("hides all controls for one photo", () => {
    render(<RecommendationPhotoCarousel photos={[photos[0]]} userName="Радха" />);

    expect(screen.getByRole("img", { name: "Радха, фото 1 из 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not start an autoplay timer", () => {
    const intervalSpy = vi.spyOn(window, "setInterval");

    render(<RecommendationPhotoCarousel photos={photos} userName="Радха" />);

    expect(intervalSpy).not.toHaveBeenCalled();
    intervalSpy.mockRestore();
  });

  it("resets to the first photo when recommendation identity changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RecommendationPhotoCarousel photos={photos} userName="Радха" />,
    );
    await user.click(screen.getByRole("button", { name: "Следующее фото" }));

    const nextPhotos = [
      { id: "new-photo", url: "https://example.com/new.webp", width: 900, height: 1200 },
      photos[0],
    ];
    rerender(<RecommendationPhotoCarousel photos={nextPhotos} userName="Кришна" />);

    expect(
      screen.getByRole("img", { name: "Кришна, фото 1 из 2" }),
    ).toHaveAttribute("src", nextPhotos[0].url);
  });
});
