-- Кто написал пояснение под цитатой.
--
-- Отдельно от автора поста: пост приносит один человек, а трактовку может
-- написать другой — и спрашивать за неё надо с него. NULL означает, что
-- пояснение собрала модель: человека за ним нет, подписывать нечем.
--
-- Существующим постам ставится NULL намеренно: задним числом мы не знаем,
-- кто писал пояснение, и приписать его наугад значит подписать чужие слова
-- чужим именем.
ALTER TABLE "MotivationPost" ADD COLUMN "explanationAuthorId" TEXT;

ALTER TABLE "MotivationPost"
  ADD CONSTRAINT "MotivationPost_explanationAuthorId_fkey"
  FOREIGN KEY ("explanationAuthorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Индекс под выборку «что написал этот человек»: она понадобится разбору
-- жалоб на пояснения.
CREATE INDEX "MotivationPost_explanationAuthorId_idx"
  ON "MotivationPost"("explanationAuthorId");
