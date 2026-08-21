-- Новости от администрации на главной и рассылка по аудитории.
--
-- Пишется руками, как и остальные миграции репозитория: `migrate dev` сносит
-- триграммные индексы и генерируемую колонку searchVector (docs/prisma-raw-sql-objects.md).

-- Закреплённая новость: висит вверху блока на главной. Частичный уникальный
-- индекс ниже гарантирует, что закреплена всегда не больше одной — снимать
-- флаг с прежней приходится сервису, но словить гонку он уже не может.
ALTER TABLE "Announcement" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- Отложенная публикация и срок жизни. Оба поля читаются при выдаче, а не
-- планировщиком: отдельный крон ради двух сравнений с now() не нужен, а
-- пропущенный тик не оставит новость невышедшей.
ALTER TABLE "Announcement" ADD COLUMN "publishAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- След рассылки: когда отправляли и скольким. Нужен, чтобы админ видел, что
-- новость уже разослана, и не бил по кнопке второй раз.
ALTER TABLE "Announcement" ADD COLUMN "broadcastAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN "broadcastCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Announcement_pinned_key" ON "Announcement" ("pinned") WHERE "pinned";
CREATE INDEX "Announcement_publishAt_idx" ON "Announcement" ("publishAt" DESC);

-- Новости портала в колокольчике: своя категория, чтобы человек мог отключить
-- их, не теряя ответов поддержки и заявок.
ALTER TABLE "NotificationPreference" ADD COLUMN "announcements" BOOLEAN NOT NULL DEFAULT true;
