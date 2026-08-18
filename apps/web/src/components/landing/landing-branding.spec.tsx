import { createElement, type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "./Navbar";
import { PhoneMockup } from "./PhoneMockup";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

/** Подписана только светлая копия знака — тёмная скрыта от скринридера. */
const mark = () => screen.getByRole("img", { name: "VedaMatch" });

describe("landing branding", () => {
  it("uses the product logo in the landing navigation", () => {
    render(
      <NextIntlClientProvider locale="ru" messages={{}}>
        <ThemeProvider>
          <Navbar />
        </ThemeProvider>
      </NextIntlClientProvider>,
    );

    expect(mark()).toHaveAttribute("src", "/brand/mark.png");
  });

  it("uses the product logo and local profile photos in the phone mockup", () => {
    render(<PhoneMockup />);

    expect(mark()).toHaveAttribute("src", "/brand/mark.png");
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
