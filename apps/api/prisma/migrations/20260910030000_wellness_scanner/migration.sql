-- Сервис «Здоровье» (`wellness`), веха 1: сканер состава продуктов.
--
-- Имя `health` занято техническим liveness-эндпоинтом для Docker HEALTHCHECK,
-- поэтому сервис зовётся `wellness` во всех слоях: модели, маршруты, папки.

CREATE TYPE "WellnessIngredientClass" AS ENUM (
  'meat', 'fish', 'egg', 'dairy', 'honey', 'gelatin', 'rennet',
  'onion', 'garlic', 'mushroom', 'alcohol', 'caffeine', 'additive', 'other'
);

CREATE TYPE "WellnessIngredientSeverity" AS ENUM ('contains', 'mayContain', 'hidden');

CREATE TYPE "WellnessVerdict" AS ENUM ('clean', 'warning', 'forbidden', 'unknown');

CREATE TYPE "WellnessProductStatus" AS ENUM ('draft', 'published', 'rejected');

CREATE TYPE "WellnessProductSource" AS ENUM ('user', 'ai', 'admin');

CREATE TYPE "WellnessReportStatus" AS ENUM ('open', 'accepted', 'rejected');

CREATE TYPE "WellnessScanKind" AS ENUM ('barcode', 'photo', 'manual');

-- Справочник ингредиентов: ради него сервис полезен с первого дня даже на
-- пустой базе продуктов. Ищется по `aliases`, а не по названию.
CREATE TABLE "WellnessIngredient" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "nameRu"    TEXT NOT NULL,
  "nameEn"    TEXT NOT NULL,
  "aliases"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "class"     "WellnessIngredientClass" NOT NULL,
  "severity"  "WellnessIngredientSeverity" NOT NULL DEFAULT 'contains',
  "eNumber"   TEXT,
  "noteRu"    TEXT,
  "noteEn"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WellnessIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessIngredient_key_key" ON "WellnessIngredient"("key");
CREATE INDEX "WellnessIngredient_class_idx" ON "WellnessIngredient"("class");

-- Продукт по штрихкоду. Строка состава хранится целиком: справочник меняется,
-- и разбор придётся повторять на исходнике.
CREATE TABLE "WellnessProduct" (
  "id"             TEXT NOT NULL,
  "barcode"        TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "brand"          TEXT,
  "ingredientsRaw" TEXT NOT NULL,
  "imageUrl"       TEXT,
  "labelImageUrl"  TEXT,
  "source"         "WellnessProductSource" NOT NULL DEFAULT 'user',
  "status"         "WellnessProductStatus" NOT NULL DEFAULT 'draft',
  "addedById"      TEXT,
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "rejectReason"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WellnessProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessProduct_barcode_key" ON "WellnessProduct"("barcode");
CREATE INDEX "WellnessProduct_status_createdAt_idx" ON "WellnessProduct"("status", "createdAt");

-- Разобранный состав. `matchedText` хранится, чтобы человек видел, на что
-- сработал вердикт, и мог нас проверить.
CREATE TABLE "WellnessProductIngredient" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "matchedText"  TEXT NOT NULL,
  "position"     INTEGER NOT NULL,
  "severity"     "WellnessIngredientSeverity" NOT NULL,

  CONSTRAINT "WellnessProductIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessProductIngredient_productId_ingredientId_key"
  ON "WellnessProductIngredient"("productId", "ingredientId");
CREATE INDEX "WellnessProductIngredient_productId_idx"
  ON "WellnessProductIngredient"("productId");

-- Что человек исключает. Пустые списки — сервис показывает состав и не судит.
CREATE TABLE "WellnessDietProfile" (
  "userId"       TEXT NOT NULL,
  "excluded"     "WellnessIngredientClass"[] NOT NULL DEFAULT ARRAY[]::"WellnessIngredientClass"[],
  "excludedKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WellnessDietProfile_pkey" PRIMARY KEY ("userId")
);

-- История сканов. Вердикт записан на момент скана: состав и справочник потом
-- правятся, а человек помнит, что ему ответили в магазине.
CREATE TABLE "WellnessScan" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "kind"           "WellnessScanKind" NOT NULL DEFAULT 'barcode',
  "barcode"        TEXT,
  "productId"      TEXT,
  "ingredientsRaw" TEXT,
  "imageUrl"       TEXT,
  "verdict"        "WellnessVerdict" NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WellnessScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WellnessScan_userId_createdAt_idx" ON "WellnessScan"("userId", "createdAt");

-- «Состав неверный»: без очереди модерации чужая ошибка отвечает всем.
CREATE TABLE "WellnessProductReport" (
  "id"          TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "authorId"    TEXT,
  "comment"     TEXT NOT NULL,
  "status"      "WellnessReportStatus" NOT NULL DEFAULT 'open',
  "decidedById" TEXT,
  "decidedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WellnessProductReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WellnessProductReport_status_createdAt_idx"
  ON "WellnessProductReport"("status", "createdAt");

-- Задел раздела «Корзина»: отобранное для покупки.
CREATE TABLE "WellnessBasketItem" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WellnessBasketItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessBasketItem_userId_productId_key"
  ON "WellnessBasketItem"("userId", "productId");
CREATE INDEX "WellnessBasketItem_userId_createdAt_idx"
  ON "WellnessBasketItem"("userId", "createdAt");

-- Задел раздела «Рецепты»: «Ведическая кулинария», рецепты Ямуны и прочее.
CREATE TABLE "WellnessRecipe" (
  "id"            TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "titleRu"       TEXT NOT NULL,
  "titleEn"       TEXT,
  "sourceRu"      TEXT,
  "descriptionRu" TEXT,
  "steps"         TEXT,
  "kcalPer100g"   INTEGER,
  "status"        "WellnessProductStatus" NOT NULL DEFAULT 'draft',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WellnessRecipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellnessRecipe_slug_key" ON "WellnessRecipe"("slug");
CREATE INDEX "WellnessRecipe_status_idx" ON "WellnessRecipe"("status");

CREATE TABLE "WellnessRecipeIngredient" (
  "id"       TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "nameRu"   TEXT NOT NULL,
  "amountRu" TEXT,
  "position" INTEGER NOT NULL,

  CONSTRAINT "WellnessRecipeIngredient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WellnessRecipeIngredient_recipeId_idx"
  ON "WellnessRecipeIngredient"("recipeId");

ALTER TABLE "WellnessProduct"
  ADD CONSTRAINT "WellnessProduct_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WellnessProduct"
  ADD CONSTRAINT "WellnessProduct_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WellnessProductIngredient"
  ADD CONSTRAINT "WellnessProductIngredient_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessProductIngredient"
  ADD CONSTRAINT "WellnessProductIngredient_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "WellnessIngredient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessDietProfile"
  ADD CONSTRAINT "WellnessDietProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessScan"
  ADD CONSTRAINT "WellnessScan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessScan"
  ADD CONSTRAINT "WellnessScan_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WellnessProductReport"
  ADD CONSTRAINT "WellnessProductReport_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessProductReport"
  ADD CONSTRAINT "WellnessProductReport_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WellnessProductReport"
  ADD CONSTRAINT "WellnessProductReport_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WellnessBasketItem"
  ADD CONSTRAINT "WellnessBasketItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessBasketItem"
  ADD CONSTRAINT "WellnessBasketItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "WellnessProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WellnessRecipeIngredient"
  ADD CONSTRAINT "WellnessRecipeIngredient_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "WellnessRecipe"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
