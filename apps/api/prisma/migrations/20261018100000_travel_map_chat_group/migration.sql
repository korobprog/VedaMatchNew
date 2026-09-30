-- Группа места в «Общении»: id беседы снимком, без FK на таблицы чата.

-- AlterTable
ALTER TABLE "public"."TravelMapPlace" ADD COLUMN     "chatConversationId" TEXT;
