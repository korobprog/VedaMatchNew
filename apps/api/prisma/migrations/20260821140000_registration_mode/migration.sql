-- Приём новых аккаунтов. Существующие входят при любом режиме.
CREATE TYPE "RegistrationMode" AS ENUM ('open', 'closed');

ALTER TABLE "AppSettings" ADD COLUMN "registrationMode" "RegistrationMode" NOT NULL DEFAULT 'open';
ALTER TABLE "AppSettings" ADD COLUMN "registrationNote" TEXT;
