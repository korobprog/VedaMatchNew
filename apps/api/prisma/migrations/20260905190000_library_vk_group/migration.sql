-- Тип материала «Группа ВКонтакте». Соседствует с telegram_channel: у
-- справочника уже есть отдельный тип для канала мессенджера, и группа ВК —
-- ровно такой же источник, а не «сообщество» в смысле общины.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

ALTER TYPE "public"."LibraryEntryType" ADD VALUE IF NOT EXISTS 'vk_group';
