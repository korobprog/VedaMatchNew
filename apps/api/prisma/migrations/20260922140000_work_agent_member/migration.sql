-- ИИ-агент как участник «Работы».
--
-- До этого MCP-клиент ходил персональным ключом человека, и всё сделанное
-- помощником числилось за его владельцем: ни в `assignee`, ни в `createdBy`,
-- ни в истории карточки ИИ отличить было нельзя. Исполнитель в «Работе» —
-- это FK на "User", поэтому агенту нужен собственный аккаунт, а не признак
-- на карточке.
--
-- Три аддитивные колонки, бэкофилл не нужен:
--  * "User"."isAgent" — служебный аккаунт. Войти им нельзя (ни пароля, ни
--    googleId), он существует ради исполнительства и следа в журнале;
--  * "UserApiKey"."agentId" — ключ, выпущенный «на агента». NULL у всех
--    существующих ключей, то есть их поведение не меняется;
--  * "WorkActivity"."onBehalfOfId" — чьей сессией действовал агент. Аккаунт
--    у агента один на всех, и без этой колонки при двух подключённых
--    помощниках вопрос «чья сессия это сделала» остаётся без ответа.
--
-- Удаление человека уносит его агентские ключи (CASCADE, как у личных), но
-- не трогает историю: там SET NULL — запись «карточку перенесли» остаётся
-- фактом и без имени.
--
-- Написано руками, а не сгенерировано `prisma migrate dev`: его диф тянет
-- посторонний дрейф схемы — то же правило, что у соседних миграций.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserApiKey" ADD COLUMN "agentId" TEXT;

-- AlterTable
ALTER TABLE "WorkActivity" ADD COLUMN "onBehalfOfId" TEXT;

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_onBehalfOfId_fkey" FOREIGN KEY ("onBehalfOfId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
