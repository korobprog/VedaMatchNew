import { describe, expect, it } from "vitest";
import { chatCardLink } from "./chat-card-link";

const work = (sourceId: string | null) => ({
  sourceService: "work",
  sourceId,
});

describe("chatCardLink", () => {
  it("приглашение «Работы» ведёт на свой экран входа", () => {
    expect(chatCardLink(work("TOKEN"))).toEqual({
      href: "/work/join/TOKEN",
      label: "Принять приглашение",
    });
  });

  it("без идентификатора ссылки нет", () => {
    expect(chatCardLink(work(null))).toBeNull();
    expect(chatCardLink(work("   "))).toBeNull();
  });

  it("незнакомый сервис ссылки не получает: молчание лучше ссылки в никуда", () => {
    expect(
      chatCardLink({ sourceService: "notices", sourceId: "42" }),
    ).toBeNull();
    expect(chatCardLink({ sourceService: null, sourceId: "42" })).toBeNull();
  });

  // Ради этих трёх проверок ссылка и собирается из пары «сервис + id», а не
  // берётся из сообщения: увести наружу отправитель не может ничем.
  it("чужой домен в идентификаторе остаётся внутренним путём", () => {
    const link = chatCardLink(work("https://evil.example/steal"));
    expect(link?.href.startsWith("/work/join/")).toBe(true);
    expect(link?.href).not.toContain("//evil");
  });

  it("протокол-относительный адрес тоже", () => {
    const link = chatCardLink(work("//evil.example"));
    expect(link?.href).toBe("/work/join/%2F%2Fevil.example");
  });

  it("выход из каталога экранируется", () => {
    const link = chatCardLink(work("../../admin"));
    expect(link?.href).toBe("/work/join/..%2F..%2Fadmin");
  });
});
