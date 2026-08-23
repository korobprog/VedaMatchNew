CREATE TABLE "ChatColorTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bubbleMine" TEXT NOT NULL,
    "bubbleTheirs" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatColorTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatColorTemplate_userId_idx" ON "ChatColorTemplate"("userId");

CREATE TABLE "ChatConversationTheme" (
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "templateId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationTheme_pkey" PRIMARY KEY ("userId","conversationId")
);

ALTER TABLE "ChatColorTemplate" ADD CONSTRAINT "ChatColorTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationTheme" ADD CONSTRAINT "ChatConversationTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationTheme" ADD CONSTRAINT "ChatConversationTheme_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChatColorTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
