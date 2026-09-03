-- Видимость способов входа переезжает в базу: админ включает способ галочкой,
-- фронт получает список с сервера и не пересобирается.

-- CreateTable
CREATE TABLE "AuthProviderSetting" (
    "provider" "AuthProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthProviderSetting_pkey" PRIMARY KEY ("provider")
);

-- Начальные значения: включён только Google — ровно то, что работает сейчас.
-- В domains пишется хост портала, не API: хост запроса нормализуется перед
-- сверкой (api.vedamatch.ru → vedamatch.ru). localhost нужен разработке.
INSERT INTO "AuthProviderSetting" ("provider", "enabled", "domains", "sortOrder", "updatedAt")
VALUES
  ('google', true,  ARRAY['vedamatch.ru', 'localhost'], 0, now()),
  ('yandex', false, ARRAY['vedamatch.ru', 'localhost'], 1, now()),
  ('vk',     false, ARRAY['vedamatch.ru', 'localhost'], 2, now()),
  ('email',  false, ARRAY[]::text[],                    3, now());
