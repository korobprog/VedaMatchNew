-- Подписчики откликов «Вакансий»: карточка предложения в Чате и строка
-- отклика в агенде «Мой день» сервиса «Работа». См. VED-27.

-- AlterEnum
ALTER TYPE "public"."ChatAttachmentKind" ADD VALUE 'vacancy';

-- CreateTable
CREATE TABLE "public"."WorkVacancyResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerTitle" TEXT NOT NULL,
    "offerKind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkVacancyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkVacancyResponse_responseId_key" ON "public"."WorkVacancyResponse"("responseId");
CREATE INDEX "WorkVacancyResponse_userId_status_updatedAt_idx" ON "public"."WorkVacancyResponse"("userId", "status", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."WorkVacancyResponse" ADD CONSTRAINT "WorkVacancyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
