-- Настройки рассылки персонального дня: ручной часовой пояс и час.
--
-- `User.timeZoneLocked` — человек выбрал пояс сам (VPN и системные настройки
-- иногда врут), автоопределение с устройства его не перезаписывает.
-- `AstroTransitPreference.pushHour` — местный час рассылки, по умолчанию 9.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

ALTER TABLE "public"."User" ADD COLUMN "timeZoneLocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "public"."AstroTransitPreference" (
    "userId" TEXT NOT NULL,
    "pushHour" INTEGER NOT NULL DEFAULT 9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AstroTransitPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "public"."AstroTransitPreference" ADD CONSTRAINT "AstroTransitPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
