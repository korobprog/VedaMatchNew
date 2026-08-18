-- Безвозвратное удаление пользователя из админки сносит строку User целиком.
-- Три ссылки на User мешали каскаду: они были Restrict. Делаем их
-- необязательными и SetNull, чтобы аудит модерации и админские списки
-- наблюдения пережили удаление автора записи.

-- MotivationModerationAudit.actorId
ALTER TABLE "MotivationModerationAudit" DROP CONSTRAINT "MotivationModerationAudit_actorId_fkey";
ALTER TABLE "MotivationModerationAudit" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "MotivationModerationAudit"
  ADD CONSTRAINT "MotivationModerationAudit_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MotivationAuthorWatch.createdById
ALTER TABLE "MotivationAuthorWatch" DROP CONSTRAINT "MotivationAuthorWatch_createdById_fkey";
ALTER TABLE "MotivationAuthorWatch" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "MotivationAuthorWatch"
  ADD CONSTRAINT "MotivationAuthorWatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MotivationSourceWatch.createdById
ALTER TABLE "MotivationSourceWatch" DROP CONSTRAINT "MotivationSourceWatch_createdById_fkey";
ALTER TABLE "MotivationSourceWatch" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "MotivationSourceWatch"
  ADD CONSTRAINT "MotivationSourceWatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
