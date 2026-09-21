-- VED-163: закладки портала. Человек кладёт в закладки любой адрес любого
-- раздела — исполнителя в Музыке, доску в Работе, книгу в Образовании.
-- Хранится путь, а не ссылка на сущность сервиса: FK на чужие модели
-- контракт запрещает (docs/service-module-contract.md).
-- Написано руками, а не сгенерировано (см. CLAUDE.md): `migrate dev` тянет
-- в diff старый дрейф схемы (генерируемая колонка LibraryEntry.searchVector
-- и trgm-индексы Образования), к закладкам отношения не имеющий.

-- CreateTable
CREATE TABLE "public"."BookmarksEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "service" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarksEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookmarksEntry_userId_createdAt_idx" ON "public"."BookmarksEntry"("userId", "createdAt" DESC);

-- Повторная закладка на ту же страницу переименовывает существующую.
-- CreateIndex
CREATE UNIQUE INDEX "BookmarksEntry_userId_path_key" ON "public"."BookmarksEntry"("userId", "path");

-- Cascade: закладки уходят вместе с аккаунтом при безвозвратном удалении.
-- AddForeignKey
ALTER TABLE "public"."BookmarksEntry" ADD CONSTRAINT "BookmarksEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
