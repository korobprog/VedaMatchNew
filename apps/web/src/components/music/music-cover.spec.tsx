import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicCover } from "./music-cover";

describe("MusicCover", () => {
  it("показывает обложку, когда она есть", () => {
    render(
      <MusicCover url="https://cdn.test/a.jpg" seed="t1" alt="Обложка: Киртан" />,
    );

    expect(screen.getByAltText("Обложка: Киртан")).toHaveAttribute(
      "src",
      "https://cdn.test/a.jpg",
    );
  });

  // Хранилище может не отдать файл (403) или объект потеряться. Битый значок с
  // подписью читается как поломка портала, хотя обложки просто нет.
  it("подменяет заглушкой, если файл не пришёл", () => {
    render(
      <MusicCover url="https://cdn.test/a.jpg" seed="t1" alt="Обложка: Киртан" />,
    );

    fireEvent.error(screen.getByAltText("Обложка: Киртан"));

    expect(screen.queryByAltText("Обложка: Киртан")).toBeNull();
  });

  it("без ссылки рисует заглушку сразу", () => {
    const { container } = render(
      <MusicCover url={null} seed="t1" alt="Обложка: Киртан" />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
