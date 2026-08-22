-- Подпись «переслано от» — снимок имени, а не ссылка на автора: пересылают
-- и из беседы, куда получатель не входит.
ALTER TABLE "public"."ChatMessage" ADD COLUMN "forwardedFrom" TEXT;
