-- Справочник общины: карточка «чем полезен», её теги и связь между ними.
-- Карточка отделена от User намеренно: справочник opt-in, поэтому наличие
-- строки в ContactsProfile — это и есть факт участия, а не флаг в профиле.

-- CreateEnum
CREATE TYPE "public"."ContactsVisibility" AS ENUM ('everyone', 'verified_only', 'same_city', 'by_link', 'hidden');

-- CreateEnum
CREATE TYPE "public"."ContactsProfileStatus" AS ENUM ('draft', 'pending', 'active');

-- CreateEnum
CREATE TYPE "public"."ContactsAshram" AS ENUM ('brahmachari', 'grihastha', 'vanaprastha', 'sannyasi');

-- CreateEnum
CREATE TYPE "public"."ContactsFormat" AS ENUM ('online', 'offline', 'any');

-- CreateEnum
CREATE TYPE "public"."ContactsTagKind" AS ENUM ('service', 'profession', 'skill', 'interest');

-- CreateTable
CREATE TABLE "public"."ContactsProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "about" TEXT,
    "offers" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ashram" "public"."ContactsAshram",
    "format" "public"."ContactsFormat" NOT NULL DEFAULT 'any',
    -- По умолчанию карточка невидима и в черновике: человек сначала заполняет,
    -- потом сам решает открыться. Иначе полупустые карточки утекут в выдачу.
    "visibility" "public"."ContactsVisibility" NOT NULL DEFAULT 'hidden',
    "status" "public"."ContactsProfileStatus" NOT NULL DEFAULT 'draft',
    "pausedUntil" TIMESTAMP(3),
    "fieldPrivacy" JSONB,
    "requestsFromVerifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactsProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactsTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "public"."ContactsTagKind" NOT NULL,
    "nameRu" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContactsTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactsProfileTag" (
    "profileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ContactsProfileTag_pkey" PRIMARY KEY ("profileId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactsProfile_userId_key" ON "public"."ContactsProfile"("userId");

-- CreateIndex
-- Основная выдача справочника всегда фильтрует по паре статус+видимость.
CREATE INDEX "ContactsProfile_status_visibility_idx" ON "public"."ContactsProfile"("status", "visibility");

-- CreateIndex
-- slug стабилен между окружениями, поэтому сид опирается именно на него.
CREATE UNIQUE INDEX "ContactsTag_slug_key" ON "public"."ContactsTag"("slug");

-- CreateIndex
CREATE INDEX "ContactsTag_kind_sortOrder_idx" ON "public"."ContactsTag"("kind", "sortOrder");

-- CreateIndex
-- Обратный обход: «кто отмечен этим тегом» — без индекса это seq scan связки.
CREATE INDEX "ContactsProfileTag_tagId_idx" ON "public"."ContactsProfileTag"("tagId");

-- AddForeignKey
ALTER TABLE "public"."ContactsProfile" ADD CONSTRAINT "ContactsProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactsProfileTag" ADD CONSTRAINT "ContactsProfileTag_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."ContactsProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactsProfileTag" ADD CONSTRAINT "ContactsProfileTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."ContactsTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
