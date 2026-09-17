-- Телефоны с приложением VedaMatch, подписанные на пуши (фаза 3 приложения).
CREATE TABLE "NotificationDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "appVariant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDevice_token_key" ON "NotificationDevice"("token");
CREATE INDEX "NotificationDevice_userId_idx" ON "NotificationDevice"("userId");

ALTER TABLE "NotificationDevice" ADD CONSTRAINT "NotificationDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
