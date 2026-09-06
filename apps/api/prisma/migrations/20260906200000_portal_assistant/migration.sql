-- AlterEnum
ALTER TYPE "public"."ChatAttachmentKind" ADD VALUE 'assistant';

-- CreateEnum
CREATE TYPE "public"."AssistantThreadKind" AS ENUM ('chat', 'compose');

-- CreateEnum
CREATE TYPE "public"."AssistantMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "public"."AssistantSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chatHelperEnabled" BOOLEAN NOT NULL DEFAULT true,
    "actionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyMessagesPerUser" INTEGER NOT NULL DEFAULT 40,
    "dailyTokensPerUser" INTEGER NOT NULL DEFAULT 80000,
    "dailyTokenBudget" INTEGER NOT NULL DEFAULT 3000000,
    "dailyCostLimitUsdCents" INTEGER NOT NULL DEFAULT 1000,
    "maxToolRounds" INTEGER NOT NULL DEFAULT 4,
    "systemPromptExtra" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssistantUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "public"."AssistantBudgetDay" (
    "day" DATE NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsdCents" INTEGER NOT NULL DEFAULT 0,
    "haltedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantBudgetDay_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "public"."AssistantThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "public"."AssistantThreadKind" NOT NULL DEFAULT 'chat',
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "public"."AssistantMessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "cards" JSONB NOT NULL DEFAULT '[]',
    "toolsUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssistantToolCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tool" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantThread_userId_kind_updatedAt_idx" ON "public"."AssistantThread"("userId", "kind", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantMessage_threadId_createdAt_idx" ON "public"."AssistantMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantToolCall_createdAt_idx" ON "public"."AssistantToolCall"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantToolCall_tool_createdAt_idx" ON "public"."AssistantToolCall"("tool", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AssistantUsage" ADD CONSTRAINT "AssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssistantThread" ADD CONSTRAINT "AssistantThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssistantMessage" ADD CONSTRAINT "AssistantMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."AssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssistantToolCall" ADD CONSTRAINT "AssistantToolCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
