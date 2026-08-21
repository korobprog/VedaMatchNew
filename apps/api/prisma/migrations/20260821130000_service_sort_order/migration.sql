-- Порядок карточек в сетке портала: до сих пор он был алфавитным и не
-- настраивался.
ALTER TABLE "Service" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
