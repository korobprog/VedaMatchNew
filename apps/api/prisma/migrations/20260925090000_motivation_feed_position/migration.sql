-- VED-432: где человек остановился в ленте раздела или источника.
-- Только новая таблица: существующие данные не трогаются.

-- CreateTable
CREATE TABLE "MotivationFeedPosition" (
    "userId" TEXT NOT NULL,
    "feedKey" VARCHAR(400) NOT NULL,
    "postId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationFeedPosition_pkey" PRIMARY KEY ("userId","feedKey")
);

-- CreateIndex
CREATE INDEX "MotivationFeedPosition_postId_idx" ON "MotivationFeedPosition"("postId");

-- AddForeignKey
ALTER TABLE "MotivationFeedPosition" ADD CONSTRAINT "MotivationFeedPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotivationFeedPosition" ADD CONSTRAINT "MotivationFeedPosition_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
