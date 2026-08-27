import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketListingSummary } from "@vedamatch/shared";
import { MarketMockup } from "./MarketMockup";
import { MARKET_DEMO_CARDS } from "@/lib/landing/market-tour";

const объявление = (over: Partial<MarketListingSummary> = {}) =>
  ({
    id: "l1",
    kind: "product",
    titleRu: "Бусы из натуральных камней",
    titleEn: null,
    price: { mode: "fixed", minor: 290000, maxMinor: null, currency: "rub" },
    condition: "new_item",
    serviceFormat: null,
    status: "published",
    primaryImageUrl: "https://s3.example/one.webp",
    city: "Хабаровск",
    country: null,
    favoritesCount: 0,
    publishedAt: "2026-08-27T02:01:12.304Z",
    shop: { id: "s1", slug: "shop", name: "CrystalManjari", logoUrl: null },
    favorited: false,
    available: true,
    canEdit: false,
    ...over,
  }) as MarketListingSummary;

/** Палец ролика — по фигуре пути: у макета нет ни ролей, ни подписей. */
const ПАЛЕЦ = "M9 11.24";
const палецНаЭкране = (container: HTMLElement) =>
  [...container.querySelectorAll("svg path")].some((path) =>
    (path.getAttribute("d") ?? "").startsWith(ПАЛЕЦ),
  );

describe("витрина Рынка", () => {
  it("показывает настоящие объявления площадки", () => {
    // Ради этого макет и заводился: на вопрос «работает ли магазин»
    // выдуманный товар не отвечает.
    render(<MarketMockup listings={[объявление()]} />);

    expect(screen.getByText("Бусы из натуральных камней")).toBeInTheDocument();
  });

  it("без ответа API показывает запасные, а не пустую рамку", () => {
    render(<MarketMockup listings={null} />);

    expect(screen.getByText(MARKET_DEMO_CARDS[0].title)).toBeInTheDocument();
  });

  it("водит тот же палец, что и остальные ролики лендинга", () => {
    // В jsdom нет IntersectionObserver, поэтому ролик идёт с первого рендера.
    const { container } = render(<MarketMockup listings={[объявление()]} />);

    expect(палецНаЭкране(container)).toBe(true);
  });

  it("скрыт от скринридера: то же самое сказано текстом выше", () => {
    const { container } = render(<MarketMockup listings={[объявление()]} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
  });

  it("не рисует больше плиток, чем помещается в рамку", () => {
    const много = Array.from({ length: 9 }, (_, i) =>
      объявление({ id: `l${i}`, titleRu: `Товар ${i}` }),
    );

    const { container } = render(<MarketMockup listings={много} />);

    expect(container.querySelectorAll("[data-market-card]")).toHaveLength(4);
  });
});
