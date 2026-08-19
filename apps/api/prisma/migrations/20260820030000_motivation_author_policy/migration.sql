-- Персональные правила автора рилсов: личный лимит, доверенный, запрет.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- CreateTable
CREATE TABLE "public"."MotivationAuthorPolicy" (
    "userId" TEXT NOT NULL,
    "dailyLimit" INTEGER,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotivationAuthorPolicy_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "public"."MotivationAuthorPolicy" ADD CONSTRAINT "MotivationAuthorPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
