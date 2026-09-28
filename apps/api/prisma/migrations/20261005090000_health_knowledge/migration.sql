-- Архив знаний сервиса «Здоровье» (VED-229): дерево рубрик и статьи
-- с обложкой. Корневые рубрики «Аюрведа» и «Западная медицина» заводятся
-- здесь же и повторный накат их не дублирует.
CREATE TYPE "WellnessArticleStatus" AS ENUM ('draft', 'published');

CREATE TABLE "WellnessKnowledgeCategory" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessKnowledgeCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WellnessArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "coverKey" TEXT,
    "coverUrl" TEXT,
    "authorId" TEXT,
    "status" "WellnessArticleStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessKnowledgeCategory_slug_key" ON "WellnessKnowledgeCategory"("slug");

CREATE INDEX "WellnessKnowledgeCategory_parentId_position_idx" ON "WellnessKnowledgeCategory"("parentId", "position");

CREATE INDEX "WellnessArticle_categoryId_status_createdAt_idx" ON "WellnessArticle"("categoryId", "status", "createdAt");

ALTER TABLE "WellnessKnowledgeCategory" ADD CONSTRAINT "WellnessKnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WellnessKnowledgeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WellnessArticle" ADD CONSTRAINT "WellnessArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WellnessKnowledgeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WellnessArticle" ADD CONSTRAINT "WellnessArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "WellnessKnowledgeCategory" ("id", "parentId", "slug", "titleRu", "titleEn", "position", "updatedAt")
VALUES
    ('wellness-knowledge-ayurveda', NULL, 'ayurveda', 'Аюрведа', 'Ayurveda', 0, CURRENT_TIMESTAMP),
    ('wellness-knowledge-western-medicine', NULL, 'western-medicine', 'Западная медицина', 'Western medicine', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
