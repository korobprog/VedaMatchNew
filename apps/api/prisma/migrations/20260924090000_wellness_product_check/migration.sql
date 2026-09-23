-- VED-384: автопроверка карточек «Здоровья» ИИ. Одна строка на продукт.

-- CreateEnum
CREATE TYPE "public"."WellnessCheckStatus" AS ENUM ('queued', 'running', 'accepted', 'refined', 'review', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "public"."WellnessProductCheck" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "public"."WellnessCheckStatus" NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "labelImageDataUrl" TEXT,
    "submittedName" TEXT NOT NULL,
    "submittedBrand" TEXT,
    "submittedIngredients" TEXT NOT NULL,
    "aiFound" BOOLEAN,
    "aiNotFood" BOOLEAN,
    "aiName" TEXT,
    "aiBrand" TEXT,
    "aiIngredients" TEXT,
    "aiConflicts" TEXT[],
    "sources" JSONB,
    "reasons" TEXT[],
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "searchCalls" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicros" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "WellnessProductCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WellnessProductCheck_productId_key" ON "public"."WellnessProductCheck"("productId");

-- CreateIndex
CREATE INDEX "WellnessProductCheck_status_updatedAt_idx" ON "public"."WellnessProductCheck"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WellnessProductCheck_createdAt_idx" ON "public"."WellnessProductCheck"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."WellnessProductCheck" ADD CONSTRAINT "WellnessProductCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."WellnessProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
