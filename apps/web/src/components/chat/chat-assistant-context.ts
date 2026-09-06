import type { ChatConversationDetail, ChatMessageDto } from "@vedamatch/shared";

/**
 * Что чат отдаёт помощнику переписки: имя собеседника и последние реплики.
 * Ассистент переписку не читает — контекст собирает чат, и ровно столько,
 * сколько нужно для уместного текста.
 */
const CONTEXT_LINES = 6;
const LINE_LENGTH = 200;

export function recipientNameOf(
  conversation: Pick<ChatConversationDetail, "kind" | "title" | "members">,
  viewerId: string,
): string | null {
  if (conversation.kind === "direct") {
    const other = conversation.members.find(
      (member) => member.user.id !== viewerId,
    );
    return other?.user.name ?? null;
  }
  return conversation.title || null;
}

export function contextLinesOf(
  messages: readonly ChatMessageDto[],
  viewerId: string,
): string[] {
  return messages
    .filter((message) => !message.deletedAt && message.body.trim())
    .slice(-CONTEXT_LINES)
    .map((message) => {
      const who = message.author.id === viewerId ? "Я" : message.author.name;
      const body = message.body.replace(/\s+/g, " ").trim();
      return `${who}: ${body.length > LINE_LENGTH ? `${body.slice(0, LINE_LENGTH - 1)}…` : body}`;
    });
}
