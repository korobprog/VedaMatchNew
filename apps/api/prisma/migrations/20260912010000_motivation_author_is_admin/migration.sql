-- Афоризм, который принёс администратор сервиса, идёт в общую ленту (VED-9).
--
-- Рилс участника без сверенного источника намеренно не показывается всем: он
-- живёт во вкладке «Мои» и по прямой ссылке. Но то же правило прятало и
-- афоризмы администраторов — те, кто ведёт сервис, добавляли публикацию и не
-- находили её в ленте. Признак снимается один раз, при создании: права потом
-- могут смениться, а решение «этот текст принёс тот, кто отвечает за сервис»
-- принималось тогда.
ALTER TABLE "MotivationPost"
  ADD COLUMN "authorIsAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Прошлые публикации администраторов отмечаем задним числом: они добавлены
-- теми же людьми и на тех же правах, и прятать их дальше незачем.
UPDATE "MotivationPost" p
SET "authorIsAdmin" = true
FROM "User" u
WHERE p."authorUserId" = u.id
  AND (
    u.role = 'admin'
    OR (
      u.role = 'service_admin'
      AND EXISTS (
        SELECT 1
        FROM "ServiceAdmin" sa
        JOIN "Service" s ON s.id = sa."serviceId"
        WHERE sa."userId" = u.id AND s.slug = 'motivation'
      )
    )
  );
