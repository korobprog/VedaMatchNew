-- Справочник городов портала. Nominatim знает индийские святые места только
-- под латинским именем: «Маяпур» кириллицей не находился вовсе, а найденный
-- по-английски уезжал в профиль как «Mayapur» — мимо русского фильтра по
-- городу у всех остальных. Справочник отвечает первым и задаёт одно
-- каноническое написание на всех.
CREATE TABLE "GeoCity" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "displayName" TEXT,
    "aliases" TEXT[],
    "weight" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoCity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeoCity_city_country_key" ON "GeoCity"("city", "country");
CREATE INDEX "GeoCity_weight_idx" ON "GeoCity"("weight");

-- Поиск идёт по началу любого из написаний (`alias ILIKE 'мая%'`). GIN по
-- массиву такой запрос не ускоряет — он умеет только точное вхождение
-- элемента, — поэтому индекса по aliases здесь нет: справочник ручной,
-- в нём сотни строк, и последовательный проход по ним дешевле поддержки
-- триграммного индекса.
