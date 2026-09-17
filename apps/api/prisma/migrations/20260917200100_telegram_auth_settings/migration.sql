-- Telegram включён только в контуре com: на vedamatch.ru способы входа
-- ограничены (406-ФЗ, auth-providers.service.ts). localhost — разработке.
INSERT INTO "AuthProviderSetting" ("provider", "enabled", "domains", "sortOrder", "updatedAt")
VALUES ('telegram', true, ARRAY['vedamatch.com', 'localhost'], 4, now())
ON CONFLICT ("provider") DO NOTHING;

-- Веб-версия приложения (ios.vedamatch.com) ходит в api.vedamatch.com, а там
-- до сих пор не был включён ни один способ: кнопка «Яндекс» отвечала
-- «способ недоступен». Google и Яндекс — на .com тоже; только добавление,
-- чужие правки списка доменов из админки не затираются.
UPDATE "AuthProviderSetting"
SET "domains" = array_append("domains", 'vedamatch.com'), "updatedAt" = now()
WHERE "provider" IN ('google', 'yandex')
  AND NOT ('vedamatch.com' = ANY ("domains"));
