-- VED-314: отличать «отправлено» от «дошло».
--
-- В логах было бодрое «доставлено 6 из 6», а человек не видел ничего: счётчик
-- считал только то, что служба доставки браузера или FCM ПРИНЯЛА сообщение.
-- Мёртвые подписки при этом удалялись лишь по ответу `gone`, всё остальное
-- копилось годами (на проде 52 веб-подписки, 17 из них старше 30 дней).
--
-- Колонки аддитивные: существующие строки получают NULL и нулевой счётчик,
-- бэкофилл не нужен. Пустой `lastSuccessAt` у старой подписки не означает
-- «мёртвая» — правило (`delivery-health.ts`) требует ещё и неудач подряд,
-- иначе подписка, которой ни разу ничего не отправляли, помечалась бы зря.
--
-- Написано руками, а не сгенерировано `prisma migrate dev`: его диф тянет
-- посторонний дрейф схемы (DEFAULT у массивов Wellness и Motivation,
-- trgm-индексы Библиотеки), и генерация спотыкается о колонку "searchVector"
-- у LibraryEntry — то же правило, что у соседних миграций.

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "PushSubscription" ADD COLUMN "lastFailureAt" TIMESTAMP(3);
ALTER TABLE "PushSubscription" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "PushSubscription" ADD COLUMN "deadSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationDevice" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "NotificationDevice" ADD COLUMN "lastFailureAt" TIMESTAMP(3);
ALTER TABLE "NotificationDevice" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationDevice" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "NotificationDevice" ADD COLUMN "deadSince" TIMESTAMP(3);
