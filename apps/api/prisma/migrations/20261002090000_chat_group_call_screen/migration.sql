-- Показ экрана в групповой комнате (VED-360).
--
-- Колонка — признак «вместо камеры идёт экран»: остальные показывают такую
-- плитку целиком и крупно. Экран занимает то же место под видео, что и
-- камера (`video` рядом остаётся `true`).
ALTER TABLE "public"."ChatGroupCallParticipant"
  ADD COLUMN "screen" BOOLEAN NOT NULL DEFAULT false;

-- Экран в комнате один: двое, нажавшие «показать» одновременно, обязаны
-- получить разные ответы, а API работает не в одном экземпляре. Частичный
-- уникальный индекс — Prisma такого не умеет объявить в схеме и при
-- следующем `migrate dev` предложит его удалить; см.
-- docs/prisma-raw-sql-objects.md.
CREATE UNIQUE INDEX "ChatGroupCallParticipant_one_screen_per_call"
  ON "public"."ChatGroupCallParticipant" ("callId")
  WHERE "screen" = true;
