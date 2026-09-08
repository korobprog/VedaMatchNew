import { describe, expect, it } from "vitest";
import type { VacancyOfferDto } from "@vedamatch/shared";
import {
  buildVacancyShareHref,
  shareSubtitle,
  shareTitle,
} from "./vacancy-share";

const offer: VacancyOfferDto = {
  id: "o1",
  kind: "work",
  title: "Повар в кафе",
  description: null,
  audience: "everyone",
  city: "Москва",
  country: null,
  lat: null,
  lon: null,
  placePrecision: "city",
  isRemote: false,
  workFormat: "onsite",
  employment: null,
  schedule: null,
  pay: { min: 60000, max: 80000, currency: "RUB", period: "month", negotiable: false },
  sevaTerm: null,
  sevaUntil: null,
  perks: [],
  dueAt: null,
  status: "published",
  moderatorNote: null,
  author: { userId: "u1", name: "Ишвара дас", avatarUrl: null },
  postedAs: null,
  publishedAt: "2026-09-08T10:00:00Z",
  expiresAt: "2026-10-08T10:00:00Z",
  closedAt: null,
  canRenew: false,
  viewsCount: 0,
  responsesCount: 0,
  isMine: false,
  myResponse: null,
};

describe("buildVacancyShareHref", () => {
  const href = buildVacancyShareHref(offer);
  const params = new URLSearchParams(href.split("?")[1]);

  it("ведёт на общий экран отправки портала своим видом карточки", () => {
    expect(href.startsWith("/chat/share?")).toBe(true);
    expect(params.get("kind")).toBe("vacancy");
    expect(params.get("sourceService")).toBe("vacancies");
    expect(params.get("sourceId")).toBe("o1");
  });

  it("полного адреса в карточке нет: ссылку соберёт чат", () => {
    expect(params.get("url")).toBeNull();
    expect(href).not.toContain("/vacancies/o1");
  });

  it("подпись собирает вид, условия и город", () => {
    // Тысячи toLocaleString разделяет узким неразрывным пробелом — сравниваем
    // с обычными, чтобы тест не зависел от невидимого символа.
    expect(params.get("subtitle")?.replace(/\s/g, " ")).toBe(
      "Работа · 60 000–80 000 ₽ в месяц · Москва",
    );
    expect(params.get("body")).toBe("Зовёт Ишвара дас");
  });
});

describe("shareSubtitle", () => {
  it("удалённое предложение подписано «удалённо» вместо города", () => {
    expect(shareSubtitle({ ...offer, isRemote: true })).toContain("удалённо");
    expect(shareSubtitle({ ...offer, isRemote: true })).not.toContain("Москва");
  });
});

describe("shareTitle", () => {
  it("режет длинный заголовок с многоточием", () => {
    expect(shareTitle("я".repeat(100))).toHaveLength(80);
    expect(shareTitle("  ")).toBe("Предложение");
  });
});
