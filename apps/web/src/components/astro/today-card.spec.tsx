import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AstroTodayDto } from "@vedamatch/shared";
import { TodayCard } from "./today-card";

const today = (overrides: Partial<AstroTodayDto> = {}): AstroTodayDto => ({
  forDate: "2026-08-10",
  moonBhava: 7,
  moonRashi: 4,
  moonNakshatra: 15,
  currentMahadasha: { lord: "saturn" },
  currentAntardasha: { lord: "venus" },
  text: null,
  ...overrides,
});

describe("TodayCard", () => {
  it("показывает готовую фразу, когда она есть", () => {
    render(
      <TodayCard
        today={today({ text: "Сегодня благоприятный день для партнёрства" })}
      />,
    );
    expect(
      screen.getByText("Сегодня благоприятный день для партнёрства"),
    ).toBeInTheDocument();
  });

  it("без фразы показывает честные факты, а не пустоту", () => {
    render(<TodayCard today={today({ text: null })} />);
    expect(screen.getByText(/Разбор дня появится чуть позже/)).toBeInTheDocument();
    expect(screen.getByText(/7-й/)).toBeInTheDocument();
  });

  it("показывает знак, накшатру и бхаву Луны", () => {
    render(<TodayCard today={today({ text: "фраза дня" })} />);
    expect(screen.getByText(/Карка/)).toBeInTheDocument();
    expect(screen.getByText(/Свати/)).toBeInTheDocument();
  });

  it("показывает текущий период даши", () => {
    render(<TodayCard today={today()} />);
    expect(screen.getByText(/Шани/)).toBeInTheDocument();
    expect(screen.getByText(/Шукра/)).toBeInTheDocument();
  });
});
