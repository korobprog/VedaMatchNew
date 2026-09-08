import { describe, expect, it } from "vitest";
import type { ChatConversationContext } from "@vedamatch/shared";
import { contextBarState } from "./chat-context-status";

const context: ChatConversationContext = {
  service: "vacancies",
  id: "r1",
  title: "Повар в кафе",
  status: "new",
  meta: { offerId: "o1", offerKind: "work", authorId: "author", responderId: "u2" },
};

describe("contextBarState", () => {
  it("автор решает, пока решения нет; соискатель только смотрит", () => {
    expect(contextBarState(context, "author").canDecide).toBe(true);
    expect(contextBarState(context, "u2").canDecide).toBe(false);
    expect(contextBarState({ ...context, status: "in_dialog" }, "author").canDecide).toBe(true);
  });

  it("после решения кнопок нет ни у кого", () => {
    for (const status of ["accepted", "declined", "closed", "withdrawn"]) {
      expect(contextBarState({ ...context, status }, "author").canDecide).toBe(false);
    }
  });

  it("подписи: вид, статус словами, ссылка на предложение", () => {
    const state = contextBarState(context, "u2");
    expect(state.kicker).toBe("Отклик · Работа");
    expect(state.statusLabel).toBe("ждёт ответа");
    expect(state.offerHref).toBe("/vacancies/o1");
  });

  it("без меты не падает: код статуса как есть и без ссылки", () => {
    const state = contextBarState({ ...context, meta: null, status: "shortlisted" }, "u2");
    expect(state.kicker).toBe("Отклик · Вакансии");
    expect(state.statusLabel).toBe("shortlisted");
    expect(state.offerHref).toBeNull();
    expect(state.canDecide).toBe(false);
  });
});
