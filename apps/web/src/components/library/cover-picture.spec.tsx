import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverPicture } from "./cover-picture";

const SRC = "https://cdn.vedamatch.ru/library/previews/katha.webp";
const OTHER = "https://cdn.vedamatch.ru/library/previews/other.webp";

/** jsdom картинок не грузит: натуральный размер подставляем сами. */
function loadAs(img: HTMLElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  fireEvent.load(img);
}

function frameOf(img: HTMLElement): HTMLElement {
  const frame = img.closest<HTMLElement>("[data-cover-frame]");
  if (!frame) throw new Error("нет рамки обложки");
  return frame;
}

describe("CoverPicture (VED-138)", () => {
  it("вписывает обложку целиком, а не обрезает её под рамку", () => {
    render(<CoverPicture src={SRC} alt="Обложка материала" />);

    const cover = screen.getByAltText("Обложка материала");
    expect(cover).toHaveAttribute("src", SRC);
    expect(cover).toHaveClass("object-contain");
    expect(cover).not.toHaveClass("object-cover");
  });

  it("без размытой копии и полей: картинка в разметке одна", () => {
    const { container } = render(<CoverPicture src={SRC} alt="Обложка" />);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector(".blur-2xl")).toBeNull();
  });

  it("пока картинка грузится, место держит 16:9", () => {
    render(<CoverPicture src={SRC} alt="Обложка" lazy />);

    const cover = screen.getByAltText("Обложка");
    expect(cover).toHaveAttribute("loading", "lazy");
    expect(frameOf(cover).style.aspectRatio).toBe("1.7778");
  });

  it("загрузившись, рамка принимает пропорции картинки — широкий баннер", () => {
    render(<CoverPicture src={SRC} alt="Обложка" />);

    const cover = screen.getByAltText("Обложка");
    loadAs(cover, 640, 249);
    const frame = frameOf(cover);
    expect(frame.style.aspectRatio).toBe("2.5703");
    // Ширину с `cqw` jsdom не разбирает — формулу проверяет cover-frame.spec.ts.
  });

  it("вертикаль — в своих пропорциях, не обрезанная под 16:9", () => {
    render(<CoverPicture src={SRC} alt="Обложка" maxHeight="70vh" />);

    const cover = screen.getByAltText("Обложка");
    loadAs(cover, 640, 1386);
    expect(frameOf(cover).style.aspectRatio).toBe("0.4618");
  });

  it("новая картинка не наследует пропорции прежней", () => {
    const { rerender } = render(<CoverPicture src={SRC} alt="Обложка" />);
    loadAs(screen.getByAltText("Обложка"), 640, 640);
    expect(frameOf(screen.getByAltText("Обложка")).style.aspectRatio).toBe("1");

    // Новый адрес ещё грузится — у браузера `complete` в этот момент ложно.
    Object.defineProperty(screen.getByAltText("Обложка"), "complete", {
      value: false,
      configurable: true,
    });
    rerender(<CoverPicture src={OTHER} alt="Обложка" />);
    expect(frameOf(screen.getByAltText("Обложка")).style.aspectRatio).toBe(
      "1.7778",
    );
  });
});
