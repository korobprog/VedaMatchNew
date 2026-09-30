-- Библиотека (VED-683): цветной перевод стихов.
CREATE TABLE "VedabaseColoring" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterSlug" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "block" VARCHAR(32) NOT NULL,
    "spans" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VedabaseColoring_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VedabaseColoring_bookId_chapterSlug_unitId_block_key"
  ON "VedabaseColoring"("bookId", "chapterSlug", "unitId", "block");
CREATE INDEX "VedabaseColoring_bookId_chapterSlug_idx"
  ON "VedabaseColoring"("bookId", "chapterSlug");

ALTER TABLE "VedabaseColoring" ADD CONSTRAINT "VedabaseColoring_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "VedabaseBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
