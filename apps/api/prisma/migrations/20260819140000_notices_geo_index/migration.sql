-- Радиусный подзапрос (notice-geo.ts, radiusIdsSql) и рамка карты фильтруют
-- по координатам среди живых объявлений; без индекса это скан всей таблицы.
CREATE INDEX "Notice_status_latitude_longitude_idx" ON "public"."Notice"("status", "latitude", "longitude");
