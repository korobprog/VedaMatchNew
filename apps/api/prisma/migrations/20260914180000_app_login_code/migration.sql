-- Одноразовые коды входа мобильного приложения (фаза 1 Android-клиента).
-- Колбэк Google или Яндекса отдаёт код через vedamatch://auth, приложение
-- меняет его на пару токенов с PKCE-верификатором. Хранится хеш кода.
CREATE TABLE "AppLoginCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppLoginCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppLoginCode_codeHash_key" ON "AppLoginCode"("codeHash");
CREATE INDEX "AppLoginCode_userId_idx" ON "AppLoginCode"("userId");
CREATE INDEX "AppLoginCode_expiresAt_idx" ON "AppLoginCode"("expiresAt");

ALTER TABLE "AppLoginCode" ADD CONSTRAINT "AppLoginCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
