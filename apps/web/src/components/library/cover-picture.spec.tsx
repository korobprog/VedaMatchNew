import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverPicture } from "./cover-picture";

const SRC = "https://cdn.vedamatch.ru/library/previews/katha.webp";

describe("CoverPicture (VED-138)", () => {
  it("вписывает обложку целиком, а не обрезает её под рамку", () => {
    render(<CoverPicture src={SRC} alt="Обложка материала" />);

    const cover = screen.getByAltText("Обложка материала");
    expect(cover).toHaveAttribute("src", SRC);
    expect(cover).toHaveClass("object-contain");
    expect(cover).not.toHaveClass("object-cover");
  });

  it("поля занимает размытая копия, скрытая от скринридера", () => {
    const { container } = render(<CoverPicture src={SRC} alt="Обложка материала" />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    const backdrop = images[0];
    expect(backdrop).toHaveAttribute("alt", "");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveClass("blur-2xl");
    // Для скринридера картинка одна.
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("рамка держит 16:9, чтобы лента не прыгала при загрузке", () => {
    const { container } = render(<CoverPicture src={SRC} alt="Обложка" lazy />);

    expect(container.firstElementChild).toHaveClass("aspect-video");
    for (const img of container.querySelectorAll("img")) {
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });
});
