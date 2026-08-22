-- Открытая беседа видна в каталоге общины и пускает к себе сама. Закрытая —
-- только по приглашению. По умолчанию закрыто: беседа, случайно ставшая
-- публичной, — это чужие люди в переписке, а обратно её уже не собрать.
CREATE TYPE "public"."ChatConversationVisibility" AS ENUM ('public', 'private');

ALTER TABLE "public"."ChatConversation"
  ADD COLUMN "visibility" "public"."ChatConversationVisibility" NOT NULL DEFAULT 'private';

-- Каналы общин заводились как витрина новостей — им публичность и нужна.
UPDATE "public"."ChatConversation"
   SET "visibility" = 'public'
 WHERE "kind" = 'channel' AND "communityId" IS NOT NULL;
