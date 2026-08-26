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
    const { container } = render(<PhoneMockup />);

    expect(mark()).toHaveAttribute("src", "/brand/mark.png");
    // Карточка позади колоды декоративна и подписи не имеет, поэтому
    // проверяем именно источники: обе демо-фотографии лежат локально.
    expect(sources(container)).toEqual(
      expect.arrayContaining([
        "/landing/profiles/alexandra.jpg",
        "/landing/profiles/maria.jpg",
      ]),
    );
  });

  it("shows real showcase profiles instead of the demo deck", () => {
    const { container } = render(
      <PhoneMockup
        cards={[
          {
            id: "user-1",
            name: "Ямуна",
            age: 36,
            city: "Новосибирск",
            country: "Россия",
            about: "Психолог, веду группы поддержки.",
            photoUrl: "https://storage.example/union/yamuna.jpg",
            interests: ["психология"],
          },
        ]}
      />,
    );

    expect(screen.getByText("Ямуна, 36")).toBeInTheDocument();
    expect(screen.getByText("Новосибирск, Россия")).toBeInTheDocument();
    expect(sources(container)).toContain(
      "https://storage.example/union/yamuna.jpg",
    );
    // Демо-колода уступила место настоящим анкетам целиком.
    expect(screen.queryByText(/Александра/)).not.toBeInTheDocument();
  });

  it("hides the age when privacy closed it", () => {
    render(
      <PhoneMockup
        cards={[
          {
            id: "user-1",
            name: "Ямуна",
            age: null,
            city: null,
            country: null,
            about: null,
            photoUrl: "https://storage.example/union/yamuna.jpg",
            interests: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("Ямуна")).toBeInTheDocument();
  });
});

/** Все src картинок отрисованного макета. */
function sources(container: HTMLElement): string[] {
  return [...container.querySelectorAll("img")].map(
    (img) => img.getAttribute("src") ?? "",
  );
}
