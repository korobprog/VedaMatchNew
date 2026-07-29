-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('male', 'female');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "gender" "public"."Gender";

-- ВНИМАНИЕ: prisma migrate dev дополнительно сгенерировала здесь удаление
-- GIN-индексов LibraryEntry_searchVector_idx и LibraryCategory_*_trgm_idx, а также
-- сброс выражения generated-колонки "searchVector". Эти объекты создаёт сырой SQL
-- в миграции library_core, в schema.prisma они не описаны, поэтому diff-движок
-- считает их лишними. Удалять нельзя — сломается поиск и подсказка дублей.
-- Подробности и как чинить: docs/prisma-raw-sql-objects.md
