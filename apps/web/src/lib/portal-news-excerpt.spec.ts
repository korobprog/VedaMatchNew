import { describe, expect, it } from "vitest";
import { isNewsTruncated, newsExcerpt } from "./portal-news-excerpt";

describe("newsExcerpt", () => {
  it("короткий текст оставляет как есть", () => {
    expect(newsExcerpt("Открыли Студию", 40)).toBe("Открыли Студию");
    expect(isNewsTruncated("Открыли Студию", 40)).toBe(false);
  });

  it("длинный режет по границе слова и ставит многоточие", () => {
    const body = "Открыли Студию: свои рилсы теперь живут в отдельном разделе";
    const cut = newsExcerpt(body, 30);

    expect(isNewsTruncated(body, 30)).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(31);
    // Слово не разорвано: последнее слово среза целиком есть в исходнике.
    expect(body.startsWith(cut.slice(0, -1))).toBe(true);
  });

  it("текст без пробелов режет по лимиту, а не по первому пробелу", () => {
    // Иначе ссылка на 300 символов оставила бы на карточке два слова.
    const body = `Ссылка ${"a".repeat(300)}`;
    expect(newsExcerpt(body, 50)).toHaveLength(51);
  });

  it("не оставляет висящую запятую или тире перед многоточием", () => {
    expect(newsExcerpt("Первое слово, второе слово тоже", 13)).toBe("Первое слово…");
  });
});
