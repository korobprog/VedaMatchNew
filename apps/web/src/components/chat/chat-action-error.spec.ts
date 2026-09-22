import { describe, expect, it } from "vitest";
import {
  CHAT_NETWORK_ERROR,
  chatActionErrorMessage,
} from "./chat-action-error";

describe("chatActionErrorMessage", () => {
  it("отдаёт текст отказа API как есть", () => {
    expect(
      chatActionErrorMessage(new Error("Вы не владелец беседы"), "запасной"),
    ).toBe("Вы не владелец беседы");
  });

  it("подменяет техническое сообщение о сбое сети", () => {
    expect(chatActionErrorMessage(new TypeError("Failed to fetch"))).toBe(
      CHAT_NETWORK_ERROR,
    );
    expect(
      chatActionErrorMessage(new Error("NetworkError when attempting to fetch")),
    ).toBe(CHAT_NETWORK_ERROR);
    expect(chatActionErrorMessage(new Error("Load failed"))).toBe(
      CHAT_NETWORK_ERROR,
    );
  });

  it("берёт запасной текст, когда тело ответа пустое", () => {
    expect(chatActionErrorMessage(new Error("   "), "Не вышло выйти")).toBe(
      "Не вышло выйти",
    );
  });

  it("берёт запасной текст, когда отклонение — не ошибка", () => {
    expect(chatActionErrorMessage("строка", "Не вышло выйти")).toBe(
      "Не вышло выйти",
    );
    expect(chatActionErrorMessage(undefined, "Не вышло выйти")).toBe(
      "Не вышло выйти",
    );
  });

  it("имеет общий запасной текст, когда свой не передали", () => {
    expect(chatActionErrorMessage(null)).toBe("Не получилось. Попробуйте ещё раз.");
  });
});
