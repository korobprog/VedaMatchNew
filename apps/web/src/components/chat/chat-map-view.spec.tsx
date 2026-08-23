import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMapState } from "@vedamatch/shared";
import { ChatMapView, inBounds } from "./chat-map-view";

// Сама карта грузит Leaflet и трогает window — в тесте важен список под ней и
// то, что в карту уезжает, а не отрисовка плиток.
let reportBounds: ((bounds: unknown) => void) | null = null;
vi.mock("./chat-map", () => ({
  ChatMap: (props: { onBoundsChange: (bounds: unknown) => void }) => {
    reportBounds = props.onBoundsChange;
    return <div data-testid="map" />;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const state: ChatMapState = {
  communities: [
    {
      community: { id: "c1", slug: "moscow", name: "Община Москвы" },
      lat: 55.75,
      lon: 37.61,
      city: "Москва",
      channels: 1,
      groups: 2,
    },
  ],
  cities: [
    { city: "Москва", country: "Россия", lat: 55.75, lon: 37.61, people: 3 },
    { city: "Рига", country: "Латвия", lat: 56.94, lon: 24.1, people: 7 },
  ],
};

describe("ChatMapView", () => {
  it("показывает города списком, по убыванию людей", () => {
    render(<ChatMapView initial={state} />);

    const rows = screen
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");
    const cityRows = rows.filter((text) => text.includes("Смотреть"));
    expect(cityRows[0]).toContain("Рига");
    expect(cityRows[0]).toContain("7 человек");
    expect(cityRows[1]).toContain("Москва");
    expect(cityRows[1]).toContain("3 человека");
  });

  it("строка города ведёт в справочник, отфильтрованный по нему", () => {
    render(<ChatMapView initial={state} />);

    expect(screen.getAllByRole("link", { name: "Смотреть" })[0]).toHaveAttribute(
      "href",
      "/chat/people?city=%D0%A0%D0%B8%D0%B3%D0%B0",
    );
  });

  it("объясняет, что метка города — это согласие, а не адрес", () => {
    render(<ChatMapView initial={state} />);

    expect(
      screen.getByText(/включившие метку в своей карточке/),
    ).toBeInTheDocument();
    expect(screen.getByText(/не по адресу человека/)).toBeInTheDocument();
  });

  it("пустая карта зовёт включить метку, а не молчит", () => {
    render(<ChatMapView initial={{ communities: [], cities: [] }} />);

    expect(
      screen.getByText(/не включали метку своего города/),
    ).toBeInTheDocument();
  });
});

describe("inBounds", () => {
  it("считает попадание в кадр", () => {
    const bounds = { north: 60, south: 50, east: 40, west: 30 };
    expect(inBounds({ lat: 55, lon: 35 }, bounds)).toBe(true);
    expect(inBounds({ lat: 65, lon: 35 }, bounds)).toBe(false);
    expect(inBounds({ lat: 55, lon: 45 }, bounds)).toBe(false);
  });

  it("кадр через 180-й меридиан не отсекает то, что видно", () => {
    // Камчатка и Аляска в одном кадре: `west` больше `east`.
    const bounds = { north: 70, south: 50, east: -150, west: 160 };
    expect(inBounds({ lat: 60, lon: 170 }, bounds)).toBe(true);
    expect(inBounds({ lat: 60, lon: -160 }, bounds)).toBe(true);
    expect(inBounds({ lat: 60, lon: 100 }, bounds)).toBe(false);
  });

  it("пока карта молчит — показываем всё", () => {
    expect(inBounds({ lat: 0, lon: 0 }, null)).toBe(true);
  });
});

describe("ChatMapView и кадр карты", () => {
  it("список показывает только то, что видно на карте", async () => {
    render(<ChatMapView initial={state} />);
    expect(screen.getByText("Рига")).toBeInTheDocument();

    // Кадр вокруг Москвы: Рига остаётся за краем.
    act(() => {
      reportBounds?.({ north: 57, south: 54, east: 39, west: 36 });
    });

    expect(screen.queryByText("Рига")).not.toBeInTheDocument();
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(screen.getByText(/Вне кадра осталось/)).toBeInTheDocument();
  });

  it("в пустом месте карты зовёт вернуть всё в кадр", () => {
    render(<ChatMapView initial={state} />);

    act(() => {
      reportBounds?.({ north: 10, south: 0, east: 10, west: 0 });
    });

    expect(screen.getByText(/В этом месте карты пусто/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Показать всё" }),
    ).toBeInTheDocument();
  });
});
