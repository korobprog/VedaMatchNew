-- VED-238, VED-116: сервис «Блог-лента». Верх главной экрана занимает лента
-- постов участников в духе Instagram, у поста есть срок нахождения в ленте
-- (его задаёт администратор), репост и страница автора — личный блог.
--
-- Написано руками, а не оставлено как сгенерировал `prisma migrate diff`: его
-- диф тянет посторонний дрейф схемы (снятие DEFAULT у массивов Wellness и
-- Motivation, удаление trgm-индексов Библиотеки, генерируемая колонка
-- "searchVector" у LibraryEntry). См. docs/prisma-raw-sql-objects.md и
-- CLAUDE.md. Здесь только три своих таблицы и их связи.
--
-- Срок живёт колонкой "feedUntil", а не считается на лету от "createdAt":
-- администратор меняет срок по умолчанию, и уже опубликованные посты не
-- должны от этого исчезать из ленты задним числом. NULL = «без срока».
--
-- "repostOfId" — самоссылка с ON DELETE SET NULL: удалённый оригинал
-- оставляет репост в ленте, но уже без вложенной карточки.

-- CreateTable
CREATE TABLE "public"."BlogPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "feedUntil" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "repostOfId" TEXT,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BlogPostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BlogSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "feedLifetimeHours" INTEGER NOT NULL DEFAULT 72,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogPost_pinned_createdAt_idx" ON "public"."BlogPost"("pinned", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BlogPost_feedUntil_idx" ON "public"."BlogPost"("feedUntil");

-- CreateIndex
CREATE INDEX "BlogPost_authorId_createdAt_idx" ON "public"."BlogPost"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BlogPost_repostOfId_idx" ON "public"."BlogPost"("repostOfId");

-- CreateIndex
CREATE INDEX "BlogPostImage_postId_position_idx" ON "public"."BlogPostImage"("postId", "position");

-- AddForeignKey
ALTER TABLE "public"."BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BlogPost" ADD CONSTRAINT "BlogPost_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "public"."BlogPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BlogPostImage" ADD CONSTRAINT "BlogPostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
