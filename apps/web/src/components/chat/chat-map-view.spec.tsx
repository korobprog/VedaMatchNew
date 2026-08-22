import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMapState } from "@vedamatch/shared";
import { ChatMapView } from "./chat-map-view";

// Сама карта грузит Leaflet и трогает window — в тесте важен список под ней и
// то, что в карту уезжает, а не отрисовка плиток.
vi.mock("./chat-map", () => ({
  ChatMap: () => <div data-testid="map" />,
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
