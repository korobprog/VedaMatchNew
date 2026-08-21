-- Поддержка проекта: реквизиты хранятся как текст и правятся из админки —
-- платёжной интеграции у портала нет.
ALTER TABLE "AppSettings" ADD COLUMN "donateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppSettings" ADD COLUMN "donateNote" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "donateDetails" TEXT;
