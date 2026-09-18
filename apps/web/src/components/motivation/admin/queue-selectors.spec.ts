import { describe, expect, it } from "vitest";
import type {
  MotivationAdminCandidateDto,
  MotivationReviewStatus,
} from "@vedamatch/shared";
import {
  countQueue,
  filterByQuery,
  selectHiddenPosts,
  selectImagePosts,
  selectPublishedPosts,
  selectSetAsidePosts,
  selectTextPosts,
} from "./queue-selectors";

function post(
  id: string,
  reviewStatus: MotivationReviewStatus,
  textApprovedAt: string | null = null,
  status: MotivationAdminCandidateDto["status"] = "draft",
): MotivationAdminCandidateDto {
  return {
    id,
    reviewStatus,
    textApprovedAt,
    status,
  } as MotivationAdminCandidateDto;
}

describe("queue selectors", () => {
  const posts = [
    post("a", "discovered"),
    post("b", "text_review"),
    post("c", "image_review", "2026-08-16T00:00:00.000Z"),
    post("d", "published", "2026-08-16T00:00:00.000Z", "published"),
    post("e", "rejected"),
  ];

  it("splits the queue by the stage each post waits at", () => {
    expect(selectTextPosts(posts).map((item) => item.id)).toEqual(["a", "b"]);
    expect(selectImagePosts(posts).map((item) => item.id)).toEqual(["c"]);
  });

  it("routes a failure to the stage it fell over at", () => {
    const failedEarly = post("f", "failed");
    const failedLate = post("g", "failed", "2026-08-16T00:00:00.000Z");

    expect(selectTextPosts([failedEarly, failedLate]).map((i) => i.id)).toEqual(["f"]);
    expect(selectImagePosts([failedEarly, failedLate]).map((i) => i.id)).toEqual(["g"]);
  });

  it("опубликованное живёт отдельно от отложенного", () => {
    expect(selectPublishedPosts(posts).map((item) => item.id)).toEqual(["d"]);
    expect(selectSetAsidePosts(posts).map((item) => item.id)).toEqual(["e"]);
  });

  it("скрытая после публикации карточка остаётся среди опубликованного (VED-251)", () => {
    // `reviewStatus` у неё так и остаётся `published`: скрытие — обратимая
    // отметка поверх уже вышедшей карточки, а не отдельная судьба. Прятать
    // её в «Отложенные» значило бы, что «Скрыть» выглядит как «удалить».
    const hidden = post("h", "published", "2026-08-16T00:00:00.000Z", "hidden");

    expect(selectPublishedPosts([hidden]).map((item) => item.id)).toEqual(["h"]);
    expect(selectSetAsidePosts([hidden])).toEqual([]);
  });

  it("в смешанном списке скрытое и отклонённое не путаются местами", () => {
    const hidden = post("h", "published", "2026-08-16T00:00:00.000Z", "hidden");
    const rejected = post("e2", "rejected", null, "draft");
    const mixed = [...posts, hidden, rejected];

    // Скрытое — в «Опубликованных» вместе с обычным `published`-постом.
    expect(selectPublishedPosts(mixed).map((item) => item.id)).toEqual([
      "d",
      "h",
    ]);
    // «Отложенные» — только по-настоящему отклонённое генерацией.
    expect(selectSetAsidePosts(mixed).map((item) => item.id)).toEqual([
      "e",
      "e2",
    ]);
  });

  // VED-251: «Все скрытые афоризмы отправляй в самый низ ленты».
  it("скрытое всегда в самом низу «Опубликованных», видимое — в прежнем порядке", () => {
    const hiddenFirst = post("h1", "published", null, "hidden");
    const visibleA = post("v1", "published", null, "published");
    const hiddenSecond = post("h2", "published", null, "hidden");
    const visibleB = post("v2", "published", null, "published");
    const mixed = [hiddenFirst, visibleA, hiddenSecond, visibleB];

    // Видимые сохраняют взаимный порядок (v1 раньше v2), скрытые — следом
    // за ними, тоже в своём взаимном порядке (h1 раньше h2), а не в конец
    // списка как попало.
    expect(selectPublishedPosts(mixed).map((item) => item.id)).toEqual([
      "v1",
      "v2",
      "h1",
      "h2",
    ]);
  });

  it("selectHiddenPosts отдаёт только скрытое — отдельная вкладка «Скрытые»", () => {
    const hidden = post("h", "published", null, "hidden");
    const mixed = [...posts, hidden];

    expect(selectHiddenPosts(mixed).map((item) => item.id)).toEqual(["h"]);
  });

  it("counts only what is actually waiting for the admin", () => {
    // Пять постов всего, но опубликованный и отклонённый ничего не ждут.
    expect(countQueue(posts)).toBe(3);
  });
});

describe("filterByQuery (VED-200)", () => {
  function candidate(
    over: Partial<MotivationAdminCandidateDto>,
  ): MotivationAdminCandidateDto {
    return {
      id: "p",
      title: "",
      text: "",
      attributionSpeaker: null,
      categoryTitle: "",
      ...over,
    } as MotivationAdminCandidateDto;
  }

  const gita = candidate({
    id: "gita",
    title: "Душа не умирает",
    text: "Душа не умирает\n\nПояснение к стиху",
    attributionSpeaker: "Прабхупада",
    categoryTitle: "Философия",
  });
  const seva = candidate({
    id: "seva",
    title: "Служение",
    text: "Служение — вечная природа",
    attributionSpeaker: "Госвами",
    categoryTitle: "Служение",
  });

  it("пустой запрос возвращает список без изменений", () => {
    expect(filterByQuery([gita, seva], "")).toEqual([gita, seva]);
    expect(filterByQuery([gita, seva], "   ")).toEqual([gita, seva]);
  });

  it("находит совпадение по цитате", () => {
    expect(filterByQuery([gita, seva], "не умирает")).toEqual([gita]);
  });

  it("находит совпадение по автору без учёта регистра", () => {
    expect(filterByQuery([gita, seva], "госвами")).toEqual([seva]);
    expect(filterByQuery([gita, seva], "ПРАБХУПАДА")).toEqual([gita]);
  });

  it("находит совпадение по названию рубрики", () => {
    expect(filterByQuery([gita, seva], "философия")).toEqual([gita]);
  });

  it("без совпадений возвращает пустой список", () => {
    expect(filterByQuery([gita, seva], "нет такого слова")).toEqual([]);
  });

  it("не роняется на посте без автора", () => {
    const noSpeaker = candidate({ id: "no-speaker", title: "Просто текст" });
    expect(filterByQuery([noSpeaker], "прабхупада")).toEqual([]);
    expect(filterByQuery([noSpeaker], "просто")).toEqual([noSpeaker]);
  });
});
