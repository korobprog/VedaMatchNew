-- CreateTable
CREATE TABLE "public"."MotivationAuthorWatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" VARCHAR(8),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSearchedAt" TIMESTAMP(3),
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MotivationAuthorWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MotivationSourceWatch" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3),
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MotivationSourceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotivationAuthorWatch_name_key" ON "public"."MotivationAuthorWatch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MotivationSourceWatch_url_key" ON "public"."MotivationSourceWatch"("url");

-- AddForeignKey
ALTER TABLE "public"."MotivationAuthorWatch" ADD CONSTRAINT "MotivationAuthorWatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MotivationSourceWatch" ADD CONSTRAINT "MotivationSourceWatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
