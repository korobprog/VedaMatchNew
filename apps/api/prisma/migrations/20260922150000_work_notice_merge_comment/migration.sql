-- VED-298: комментарий и перенос карточки, сделанные одним человеком в одно
-- окно, склеиваются в одно уведомление. Для этого очередь дозревания начинает
-- принимать не только переезды:
--   * fromColumnId становится необязательным — строку теперь заводит и
--     комментарий, у которого никакого «откуда» нет;
--   * commentBody/commentCount хранят последнюю реплику окна и их число;
--   * ключ уникальности получает actorId — склеивать можно только сделанное
--     одним человеком, двое правят карточку одновременно = два разных факта.
--
-- Строки живут минуты, поэтому ничего не переносим: очередь на момент наката
-- почти пуста, а задержавшиеся записи доедут как обычные переезды.

ALTER TABLE "WorkTaskNotice" ALTER COLUMN "fromColumnId" DROP NOT NULL;

ALTER TABLE "WorkTaskNotice" ADD COLUMN "commentBody" TEXT;
ALTER TABLE "WorkTaskNotice" ADD COLUMN "commentCount" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "WorkTaskNotice_taskId_recipientId_key";
CREATE UNIQUE INDEX "WorkTaskNotice_taskId_recipientId_actorId_key"
  ON "WorkTaskNotice"("taskId", "recipientId", "actorId");
