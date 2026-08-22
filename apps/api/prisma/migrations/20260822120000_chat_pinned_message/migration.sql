-- Закреплённое сообщение беседы. Одно на беседу: больше одного превращает
-- шапку в ленту, и то, что «важно всегда», перестаёт читаться.
ALTER TABLE "public"."ChatConversation" ADD COLUMN "pinnedMessageId" TEXT;

CREATE UNIQUE INDEX "ChatConversation_pinnedMessageId_key" ON "public"."ChatConversation"("pinnedMessageId");

ALTER TABLE "public"."ChatConversation"
  ADD CONSTRAINT "ChatConversation_pinnedMessageId_fkey"
  FOREIGN KEY ("pinnedMessageId") REFERENCES "public"."ChatMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
