-- Режим прогулки: рассказ, фото и короткое видео на остановке маршрута.

-- AlterTable
ALTER TABLE "public"."TravelMapRouteStop" ADD COLUMN     "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "story" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "videoKey" TEXT,
ADD COLUMN     "videoUrl" TEXT;
