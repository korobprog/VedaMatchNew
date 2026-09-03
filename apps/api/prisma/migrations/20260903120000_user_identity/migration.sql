-- Способ входа отвязывается от User: вместо колонки googleId появляется
-- таблица идентичностей, по паре «провайдер + внешний идентификатор».
-- Колонка User.googleId намеренно остаётся: она нужна для отката и сверки,
-- убирается отдельной миграцией после того, как перенос отработает в проде.

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('google', 'vk', 'yandex', 'email');

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_externalId_key" ON "UserIdentity"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос живых аккаунтов Google в идентичности.
INSERT INTO "UserIdentity" ("id", "userId", "provider", "externalId", "createdAt")
SELECT gen_random_uuid(), "id", 'google'::"AuthProvider", "googleId", "createdAt"
FROM "User"
WHERE "googleId" IS NOT NULL;
