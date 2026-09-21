-- Камера участника групповой комнаты (VED-293, этап 4).
--
-- Одна колонка. Из сгенерированного Prisma файла вручную удалён чужой
-- дрейф — DROP INDEX по LibraryCategory/LibraryEntry и снятие DEFAULT у
-- скалярных списков: эти объекты заведены сырым SQL и Prisma о них не
-- знает, см. docs/prisma-raw-sql-objects.md. Без удаления миграция падает
-- P3018 на чужой базе.
ALTER TABLE "public"."ChatGroupCallParticipant"
  ADD COLUMN "video" BOOLEAN NOT NULL DEFAULT false;
