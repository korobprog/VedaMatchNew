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

/**
 * Знак ищется по роли, а не по alt: с переходом на вектор это больше не
 * <img>, а <svg role="img" aria-label>. Проверять `src` файла теперь не на
 * чем и не нужно — весь смысл замены был в том, чтобы цвет знака брался
 * из темы, а не из пикселей.
 */
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

    expect(mark().tagName.toLowerCase()).toBe("svg");
  });

  it("uses the product logo and local profile photos in the phone mockup", () => {
    render(<PhoneMockup />);

    expect(mark().tagName.toLowerCase()).toBe("svg");
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
