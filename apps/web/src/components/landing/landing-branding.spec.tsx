import { createElement, type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Navbar } from "./Navbar";
import { PhoneMockup } from "./PhoneMockup";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => {
    const { fill, priority, ...imageProps } = props;
    void fill;
    void priority;
    return createElement("img", imageProps);
  },
}));

describe("landing branding", () => {
  it("uses the product logo in the landing navigation", () => {
    render(<Navbar />);

    expect(screen.getByAltText("VedaMatch")).toHaveAttribute(
      "src",
      "/logo_tilak.png",
    );
  });

  it("uses the product logo and local profile photos in the phone mockup", () => {
    render(<PhoneMockup />);

    expect(screen.getByAltText("VedaMatch")).toHaveAttribute(
      "src",
      "/logo_tilak.png",
    );
    expect(screen.getByAltText("Александра")).toHaveAttribute(
      "src",
      "/landing/profiles/alexandra.jpg",
    );
    expect(screen.getByAltText("Мария")).toHaveAttribute(
      "src",
      "/landing/profiles/maria.jpg",
    );
  });
});
