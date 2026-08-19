-- Приватность места: у объявлений с точностью `city` координаты прибиваются
-- к сетке 0.02° (см. CITY_COORD_GRID в notice-geo.ts). До этой миграции
-- сервер хранил координаты клиента как есть, и карта/радиусный поиск могли
-- выдать точное место человека. Огрубляем накопленные строки; `exact`
-- (публикации общин) не трогаем.
UPDATE "public"."Notice"
SET
  "latitude"  = round("latitude"  / 0.02) * 0.02,
  "longitude" = round("longitude" / 0.02) * 0.02,
  "location"  = CASE
    WHEN "location" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set("location"::jsonb, '{lat}', to_jsonb(round("latitude"  / 0.02) * 0.02)),
      '{lon}', to_jsonb(round("longitude" / 0.02) * 0.02)
    )
  END
WHERE "placePrecision" = 'city'
  AND "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL;
