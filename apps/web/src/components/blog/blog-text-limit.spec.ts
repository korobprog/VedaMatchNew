import { describe, expect, it } from "vitest";
import { BLOG_POST_TEXT_MAX_LENGTH } from "@vedamatch/shared";
import { blogTextLimitState } from "./blog-text-limit";

describe("blogTextLimitState", () => {
  it("shows a quiet counter while there is room", () => {
    const state = blogTextLimitState("Харе Кришна");
    expect(state.over).toBe(false);
    expect(state.tone).toBe("quiet");
    expect(state.used).toBe(11);
    expect(state.label).toBe(`11 из ${BLOG_POST_TEXT_MAX_LENGTH}`);
  });

  it("warns when the end is near, counting what is left", () => {
    const state = blogTextLimitState("я".repeat(BLOG_POST_TEXT_MAX_LENGTH - 40));
    expect(state.tone).toBe("warn");
    expect(state.remaining).toBe(40);
    expect(state.label).toBe("Осталось 40 знаков.");
  });

  it("says how much to cut when the text does not fit", () => {
    const state = blogTextLimitState("я".repeat(BLOG_POST_TEXT_MAX_LENGTH + 3));
    expect(state.over).toBe(true);
    expect(state.tone).toBe("over");
    expect(state.overBy).toBe(3);
    expect(state.remaining).toBe(0);
    expect(state.label).toBe("Лишних 3 знака — столько нужно убрать.");
  });

  it("counts exactly the limit as fitting", () => {
    const state = blogTextLimitState("я".repeat(BLOG_POST_TEXT_MAX_LENGTH));
    expect(state.over).toBe(false);
    expect(state.remaining).toBe(0);
    expect(state.label).toBe("Осталось 0 знаков.");
  });

  // Сервер режет пробелы по краям и считает `\n`, а не `\r\n`: счётчик обязан
  // считать то же, иначе он врёт на границе.
  it("counts like the server: trimmed, with normalized line breaks", () => {
    expect(blogTextLimitState("  Раз\r\nДва  ").used).toBe(7);
  });

  it("declines a custom limit of its own", () => {
    const state = blogTextLimitState("я".repeat(12), 10);
    expect(state.over).toBe(true);
    expect(state.label).toBe("Лишних 2 знака — столько нужно убрать.");
  });

  it("uses the right plural for one extra character", () => {
    expect(
      blogTextLimitState("я".repeat(BLOG_POST_TEXT_MAX_LENGTH + 1)).label,
    ).toBe("Лишний 1 знак — столько нужно убрать.");
  });
});
