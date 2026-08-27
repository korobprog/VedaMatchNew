-- Записи астролога: карты людей, которых он ведёт. Своя карта остаётся в
-- AstroBirthData и единственной — здесь только чужие.
CREATE TABLE "AstroSubject" (
  "id"             TEXT NOT NULL,
  "ownerId"        TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "bornAtUtc"      TIMESTAMP(3) NOT NULL,
  "birthDateLocal" DATE NOT NULL,
  "birthTimeLocal" TEXT,
  "timeAccuracy"   "AstroTimeAccuracy" NOT NULL DEFAULT 'exact',
  "placeLabel"     TEXT NOT NULL,
  "latitude"       DOUBLE PRECISION NOT NULL,
  "longitude"      DOUBLE PRECISION NOT NULL,
  "timezone"       TEXT NOT NULL,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AstroSubject_pkey" PRIMARY KEY ("id")
);

-- Список открывается свежими сверху — по этому же порядку и индекс.
CREATE INDEX "AstroSubject_ownerId_updatedAt_idx" ON "AstroSubject"("ownerId", "updatedAt");

-- Cascade: записи уходят вместе с аккаунтом владельца. Это часть обещания о
-- приватности, а не деталь реализации — данные людей, не подписывавшихся на
-- портал, не должны переживать того, кто их завёл.
ALTER TABLE "AstroSubject"
  ADD CONSTRAINT "AstroSubject_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
