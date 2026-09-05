-- Организационная принадлежность материала Образования: от имени какой
-- общины он выложен. null — лично от себя.
--
-- Тот же приём, что в Объявлениях (20260817120000_notices_core): автор
-- всегда человек, а община отвечает только на «от чьего имени показано».
-- ON DELETE SET NULL по той же причине, что там: удаление общины не должно
-- уносить с собой чужие материалы — они остаются, просто без подписи.

ALTER TABLE "public"."LibraryEntry" ADD COLUMN "communityId" TEXT;

CREATE INDEX "LibraryEntry_communityId_status_publishedAt_idx"
  ON "public"."LibraryEntry"("communityId", "status", "publishedAt" DESC);

ALTER TABLE "public"."LibraryEntry"
  ADD CONSTRAINT "LibraryEntry_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
