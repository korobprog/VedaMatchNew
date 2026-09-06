import { describe, expect, it } from "vitest";
import type { ChatMessageDto } from "@vedamatch/shared";
import { contextLinesOf, recipientNameOf } from "./chat-assistant-context";

const msg = (id: string, authorId: string, name: string, body: string, deletedAt: string | null = null): ChatMessageDto => ({
  id,
  conversationId: "c1",
  author: { id: authorId, name, avatarUrl: null, lastSeenAt: null },
  body,
  createdAt: "2026-09-06T10:00:00.000Z",
  editedAt: null,
  deletedAt,
  attachments: [],
  reactions: [],
  replyTo: null,
  readByOthers: false,
});

describe("recipientNameOf", () => {
  const members = [
    { user: { id: "me", name: "Радха", avatarUrl: null, lastSeenAt: null }, role: "member" as const, joinedAt: "" },
    { user: { id: "u2", name: "Кешава", avatarUrl: null, lastSeenAt: null }, role: "member" as const, joinedAt: "" },
  ];

  it("в диалоге — собеседник, в группе — название", () => {
    expect(recipientNameOf({ kind: "direct", title: "Кешава", members }, "me")).toBe("Кешава");
    expect(recipientNameOf({ kind: "group", title: "Ятра", members }, "me")).toBe("Ятра");
    expect(recipientNameOf({ kind: "group", title: "", members }, "me")).toBeNull();
  });
});

describe("contextLinesOf", () => {
  it("берёт последние реплики, подписывает «Я», пропускает удалённые и пустые", () => {
    const messages = [
      msg("1", "u2", "Кешава", "Привет"),
      msg("2", "me", "Радха", "Удалено", "2026-09-06T10:01:00.000Z"),
      msg("3", "me", "Радха", "   "),
      msg("4", "me", "Радха", "Здравствуйте,   как дела?"),
    ];
    expect(contextLinesOf(messages, "me")).toEqual(["Кешава: Привет", "Я: Здравствуйте, как дела?"]);
  });

  it("не больше шести строк, длинные режутся", () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(String(i), "u2", "Кешава", `реплика ${i} ` + "x".repeat(300)));
    const lines = contextLinesOf(messages, "me");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("реплика 4");
    expect(lines[0].length).toBeLessThanOrEqual(210);
  });
});
