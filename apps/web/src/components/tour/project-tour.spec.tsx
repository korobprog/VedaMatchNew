import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { TourChapter } from "@/lib/tour";
import { ProjectTour } from "./project-tour";

const chapters: TourChapter[] = [
  {
    id: "about",
    title: "Что такое VedaMatch",
    text: "Портал для преданных.",
    videoUrl: null,
    posterUrl: null,
    cta: { label: "Все сервисы", href: "/#services" },
  },
  {
    id: "music",
    title: "Музыка и Радио",
    text: "Общий эфир круглые сутки.",
    videoUrl: "https://v/music.mp4",
    posterUrl: null,
    cta: { label: "Включить радио", href: "/radio" },
  },
];

/* VED-651: туториал «Познакомиться с проектом». */
describe("ProjectTour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/tour");
  });

  it("без видео — заглушка и текст главы", () => {
    render(<ProjectTour chapters={chapters} />);
    expect(screen.getByText("Видео готовится")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Что такое VedaMatch" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Предыдущая/ })).toBeDisabled();
  });

  it("«Следующая» открывает главу с видео и пишет её в якорь", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProjectTour chapters={chapters} />);

    await user.click(screen.getByRole("button", { name: /Следующая/ }));

    expect(window.location.hash).toBe("#music");
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://v/music.mp4",
    );
    expect(
      screen.getByRole("link", { name: "Включить радио" }),
    ).toHaveAttribute("href", "/radio");
  });

  it("досмотренная глава получает галочку и запоминается", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProjectTour chapters={chapters} />);
    await user.click(screen.getByRole("button", { name: /Музыка и Радио/ }));

    fireEvent.ended(container.querySelector("video")!);

    expect(screen.getByLabelText("Просмотрено")).toBeInTheDocument();
    expect(window.localStorage.getItem("vm-tour-watched")).toBe('["music"]');
  });

  it("глава из якоря адреса открывается сразу", () => {
    window.history.replaceState(null, "", "/tour#music");
    render(<ProjectTour chapters={chapters} />);
    expect(
      screen.getByRole("heading", { name: "Музыка и Радио" }),
    ).toBeInTheDocument();
  });
});
