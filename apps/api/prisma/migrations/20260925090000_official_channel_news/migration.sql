-- Новости в официальный канал и напоминание обновить приложение с сайта.
-- Аддитивно: две колонки без значений и две новые таблицы.

-- Версия установленной сборки и отметка «о каком выпуске уже напомнили».
ALTER TABLE "NotificationDevice" ADD COLUMN "appVersionCode" INTEGER,
ADD COLUMN "updatePromptedCode" INTEGER;

-- Выпуски приложения с сайта, замеченные по манифесту latest.json.
CREATE TABLE "NotificationAppRelease" (
    "id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "notes" TEXT,
    "builtAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "announcedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationAppRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationAppRelease_variant_versionCode_key" ON "NotificationAppRelease"("variant", "versionCode");
CREATE INDEX "NotificationAppRelease_status_updatedAt_idx" ON "NotificationAppRelease"("status", "updatedAt");

-- Очередь постов официального канала от других сервисов.
CREATE TABLE "ChatOfficialPost" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "authorHintId" TEXT,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "messageId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatOfficialPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatOfficialPost_source_sourceId_key" ON "ChatOfficialPost"("source", "sourceId");
CREATE INDEX "ChatOfficialPost_status_publishAt_idx" ON "ChatOfficialPost"("status", "publishAt");

ALTER TABLE "ChatOfficialPost" ADD CONSTRAINT "ChatOfficialPost_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
