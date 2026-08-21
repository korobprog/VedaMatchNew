-- Баннер новости на главной: до сих пор анонсы жили только в архиве
-- /updates/news, куда надо было специально пойти.
ALTER TABLE "Announcement" ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN "homeUntil" TIMESTAMP(3);

CREATE INDEX "Announcement_status_showOnHome_homeUntil_idx"
    ON "Announcement"("status", "showOnHome", "homeUntil");
