-- Add chat messages for accepted Union connection requests
CREATE TABLE "UnionChatMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnionChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UnionChatMessage_requestId_createdAt_idx" ON "UnionChatMessage"("requestId", "createdAt");
CREATE INDEX "UnionChatMessage_fromUserId_idx" ON "UnionChatMessage"("fromUserId");

ALTER TABLE "UnionChatMessage" ADD CONSTRAINT "UnionChatMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "UnionConnectionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnionChatMessage" ADD CONSTRAINT "UnionChatMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
