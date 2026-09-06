import { describe, expect, it } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
import {
  buildPendingMessage,
  dropPendingMessage,
  isPendingMessage,
  settlePendingMessage,
} from "./pending-message";

const author = { id: "user-1", name: "Мадхава" } as ChatMessageDto["author"];

function pending(seed = "a", over: Record<string, unknown> = {}) {
  return buildPendingMessage({
    seed,
    conversationId: "c-1",
    author,
    body: "Харе Кришна",
    attachments: [],
    replyTo: null,
    now: new Date("2026-09-05T10:00:00.000Z"),
    ...over,
  });
}

function saved(id: string): ChatMessageDto {
  return {
    id,
    conversationId: "c-1",
    author,
    body: "Харе Кришна",
    attachments: [],
    reactions: [],
    createdAt: "2026-09-05T10:00:01.000Z",
  };
}

describe("buildPendingMessage", () => {
  it("рисуется как своё сообщение: тот же автор и то же тело", () => {
    const draft = pending();

    expect(draft.author.id).toBe("user-1");
    expect(draft.body).toBe("Харе Кришна");
  });

  it("узнаётся как ещё не доехавшее", () => {
    expect(isPendingMessage(pending())).toBe(true);
    expect(isPendingMessage(saved("m-1"))).toBe(false);
  });

  it("не обещает, что его прочитали: оно ещё не доехало", () => {
    expect(pending().readByOthers).toBe(false);
  });

  it("вложения показывает без адресов — подписанная ссылка придёт с сервера", () => {
    const draft = pending("a", {
      attachments: [{ kind: "image", key: "chat/1.webp" }],
    });

    expect(draft.attachments).toHaveLength(1);
    expect(draft.attachments[0].url).toBeNull();
  });

  it("переносит цитату в той форме, в какой её рисует лента", () => {
    const draft = pending("a", {
      replyTo: {
        ...saved("m-9"),
        body: "Вопрос",
        attachments: [{ id: "a1", kind: "voice" }],
      },
    });

    expect(draft.replyTo).toMatchObject({
      id: "m-9",
      authorName: "Мадхава",
      body: "Вопрос",
      attachmentKind: "voice",
    });
  });

  it("два черновика подряд не сталкиваются идентификаторами", () => {
    expect(pending("a").id).not.toBe(pending("b").id);
  });
});

describe("settlePendingMessage", () => {
  it("меняет черновик на пришедшее с сервера", () => {
    const draft = pending();

    const next = settlePendingMessage([draft], draft.id, saved("m-1"));

    expect(next.map((message) => message.id)).toEqual(["m-1"]);
  });

  it("не двоит, когда сообщение уже прилетело по сокету", () => {
    const draft = pending();

    // Два одинаковых пузыря подряд выглядят как двойная отправка — ровно то,
    // чего человек и боялся.
    const next = settlePendingMessage([draft, saved("m-1")], draft.id, saved("m-1"));

    expect(next.map((message) => message.id)).toEqual(["m-1"]);
  });

  it("не трогает чужие сообщения", () => {
    const draft = pending();

    const next = settlePendingMessage(
      [saved("m-0"), draft],
      draft.id,
      saved("m-1"),
    );

    expect(next.map((message) => message.id)).toEqual(["m-0", "m-1"]);
  });
});

describe("dropPendingMessage", () => {
  it("убирает черновик, который не доехал", () => {
    const draft = pending();

    expect(dropPendingMessage([saved("m-0"), draft], draft.id)).toEqual([
      saved("m-0"),
    ]);
  });
});
