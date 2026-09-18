import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicTrackLyrics } from "./music-track-lyrics";

describe("MusicTrackLyrics", () => {
  it("ничего не рисует, если все три поля пустые", () => {
    const { container } = render(
      <MusicTrackLyrics
        lyrics={{ lyrics: null, transliteration: null, translation: null }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // VED-248: раньше поля шли колонками рядом на широком экране — перевод
  // уезжал в свою колонку сбоку от текста. Теперь одно окно, блоки подряд.
  it("перевод и текст — блоки подряд в одном окне, не колонки рядом", () => {
    render(
      <MusicTrackLyrics
        lyrics={{
          lyrics: "Строка оригинала",
          transliteration: "Строка транслитерации",
          translation: "Строка перевода",
        }}
      />,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Текст" });
    const wrapper = heading.nextElementSibling;
    expect(wrapper).not.toBeNull();
    // Нет сетки в несколько колонок — только одна колонка (flex-col).
    expect(wrapper?.className).not.toContain("grid");
    expect(wrapper?.className).toContain("flex-col");
  });

  it("порядок блоков — текст, сразу перевод, транслитерация последней", () => {
    render(
      <MusicTrackLyrics
        lyrics={{
          lyrics: "Строка оригинала",
          transliteration: "Строка транслитерации",
          translation: "Строка перевода",
        }}
      />,
    );

    const labels = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(labels).toEqual(["Текст", "Перевод", "Транслитерация"]);
  });

  it("пустое поле не рисует свой блок", () => {
    render(
      <MusicTrackLyrics
        lyrics={{ lyrics: "Только текст", transliteration: null, translation: null }}
      />,
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent),
    ).toEqual(["Текст"]);
  });

  it("разные headingId у разных экземпляров не конфликтуют", () => {
    render(
      <MusicTrackLyrics
        lyrics={{ lyrics: "Текст", transliteration: null, translation: null }}
        headingId="music-lyrics-player"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Текст" }),
    ).toHaveAttribute("id", "music-lyrics-player");
  });

  it("compact убирает верхний отступ секции", () => {
    const { container: normal } = render(
      <MusicTrackLyrics
        lyrics={{ lyrics: "Текст", transliteration: null, translation: null }}
      />,
    );
    const { container: compact } = render(
      <MusicTrackLyrics
        lyrics={{ lyrics: "Текст", transliteration: null, translation: null }}
        compact
      />,
    );

    expect(normal.querySelector("section")?.className).toContain("mt-10");
    expect(compact.querySelector("section")?.className).not.toContain("mt-10");
  });
});
