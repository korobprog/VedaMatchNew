import { createElement, type ImgHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LINEAGES } from "@vedamatch/shared";
import { ThemeProvider } from "@/components/theme-provider";
import ru from "../../../messages/ru.json";
import { VaishnavaLandingPage } from "./VaishnavaLandingPage";

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

// Leaflet требует настоящего DOM с размерами; карта покрыта своим тестом,
// здесь важно лишь, появляется ли секция.
vi.mock("./CommunitiesMap", () => ({
  CommunitiesMap: () => <div data-testid="communities-map" />,
}));

// В jsdom нет IntersectionObserver, а секции появляются по `whileInView`.
// Заглушка ничего не наблюдает: разметка и без анимации уже в документе.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

function renderPage(props: Parameters<typeof VaishnavaLandingPage>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <ThemeProvider>
        <VaishnavaLandingPage {...props} />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe("VaishnavaLandingPage", () => {
  it("lists every lineage from the shared directory", () => {
    renderPage();

    // «ISKCON» стоит и заголовком группы, и чипом — ищем среди чипов.
    for (const lineage of LINEAGES) {
      expect(screen.getAllByText(lineage.label).length).toBeGreaterThan(0);
    }
  });

  it("links each service to its public description page", () => {
    renderPage();

    for (const slug of [
      "union",
      "chat",
      "vedabase",
      "library",
      "motivation",
      "astro",
      "notices",
      "market",
    ]) {
      expect(
        document.querySelector(`a[href="/services/${slug}"]`),
        slug,
      ).not.toBeNull();
    }
  });

  it("sends the start button to the login with the portal home as return", () => {
    renderPage();

    const start = screen.getAllByRole("link", { name: /Войти в портал/ })[0];
    expect(start).toHaveAttribute("href", "/login");
  });

  it("shows real counters and hides the map without communities", () => {
    renderPage({ totalMembers: 1200, totalCities: 48, totalCommunities: 17 });

    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.queryByTestId("communities-map")).not.toBeInTheDocument();
  });

  it("renders the map section when the public map has points", () => {
    renderPage({
      communities: [
        {
          community: { id: "c1", name: "Ятра Новосибирска" } as never,
          lat: 55,
          lon: 83,
          city: "Новосибирск",
          channels: 2,
          groups: 1,
        },
      ],
    });

    expect(screen.getByTestId("communities-map")).toBeInTheDocument();
  });
});
