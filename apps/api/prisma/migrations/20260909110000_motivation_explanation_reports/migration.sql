-- Жалобы на пояснение под цитатой и скрытие по порогу.
--
-- Скрываем, а не стираем: скрытие обратимо, админ возвращает трактовку из
-- панели, а стёртый текст вернуть неоткуда. Заодно остаётся, что показать
-- разбирающему жалобу — иначе он судит о том, чего уже нет.
ALTER TABLE "MotivationPost" ADD COLUMN "explanationHiddenAt" TIMESTAMP(3);

CREATE TABLE "MotivationExplanationReport" (
  "id"        TEXT NOT NULL,
  "postId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MotivationExplanationReport_pkey" PRIMARY KEY ("id")
);

-- Одна жалоба на человека: повторное нажатие снимает свою, а не добавляет
-- вторую. Иначе один человек в одиночку прятал бы чужую трактовку.
CREATE UNIQUE INDEX "MotivationExplanationReport_postId_userId_key"
  ON "MotivationExplanationReport"("postId", "userId");

CREATE INDEX "MotivationExplanationReport_postId_idx"
  ON "MotivationExplanationReport"("postId");

ALTER TABLE "MotivationExplanationReport"
  ADD CONSTRAINT "MotivationExplanationReport_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MotivationExplanationReport"
  ADD CONSTRAINT "MotivationExplanationReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
