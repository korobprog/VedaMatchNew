import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import type { TourChapter } from "@/lib/tour";
import { TourVideoHelp } from "./tour-video-help";

const chapter: TourChapter = {
  id: "union",
  title: "Знакомства",
  text: "Знакомства для создания вайшнавской семьи.",
  video: {
    desktopUrl: "https://v/union.mp4",
    mobileUrl: "https://v/union-vertical.mp4",
    posterUrl: null,
  },
  cta: { label: "О Знакомствах", href: "/services/union" },
};

beforeAll(() => {
  // В jsdom у <dialog> нет showModal/close.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

/* VED-651: «?» у названия сервиса открывает видео-презентацию. */
describe("TourVideoHelp", () => {
  it("«?» открывает окно с видео и ссылкой на туториал, «Закрыть» убирает видео", async () => {
    const user = userEvent.setup();
    const { container } = render(<TourVideoHelp chapter={chapter} />);
    expect(container.querySelector("video")).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Видео: Знакомства — как это устроено",
      }),
    );

    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://v/union.mp4",
    );
    expect(screen.getByRole("link", { name: /Весь туториал/ })).toHaveAttribute(
      "href",
      "/tour#union",
    );

    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(container.querySelector("video")).toBeNull();
  });
});
