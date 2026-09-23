-- История уведомлений (VED-404): время последнего контакта с уведомлением.
-- Аддитивно: новая колонка без значения по умолчанию и индекс.
ALTER TABLE "NotificationItem" ADD COLUMN "contactAt" TIMESTAMP(3);

-- Уже прочитанным контакт — момент прочтения: другого следа контакта у них
-- нет, а без значения они выпали бы из истории. Непрочитанные не трогаем.
UPDATE "NotificationItem" SET "contactAt" = "readAt"
WHERE "readAt" IS NOT NULL AND "contactAt" IS NULL;

CREATE INDEX "NotificationItem_userId_contactAt_idx" ON "NotificationItem"("userId", "contactAt");
